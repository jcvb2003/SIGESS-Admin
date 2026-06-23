// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';
import * as svc from '../_shared/billing/billing-service.ts';
import * as repo from '../_shared/billing/repositories.ts';
import { syncBillingSummaryToRuntime } from '../_shared/billing/projection-service.ts';
import { log } from '../_shared/billing/logger.ts';
import { loadBillingProviderConfig } from '../_shared/billing/provider-config.ts';
import type { BillingProvider } from '../_shared/billing/provider.interface.ts';

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function createHttpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

async function validateAdminSession(req: Request, db: SupabaseClient) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw createHttpError('Missing Authorization header', 401);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw createHttpError('Unauthorized', 401);
  return user;
}

function handleError(err: unknown): Response {
  let message = 'Erro interno';
  let status = 500;

  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') message = e.message;
    if (typeof e.status === 'number') status = e.status;
  } else if (typeof err === 'string') {
    message = err;
  }

  console.error(`[billing-sync] Error [${status}]:`, message);
  return json({ error: message }, status);
}

// ─── sync_all ─────────────────────────────────────────────────────────────────

async function handleSyncAll(
  db: SupabaseClient,
  provider: BillingProvider,
  dunningThreshold: number,
  t0: number,
) {
  const accounts = await repo.findAccountsForSync(db);

  const results: { accountId: string; ok: boolean; error?: string }[] = [];
  let auto_suspended = 0;

  for (const account of accounts) {
    try {
      const sub = await repo.findActiveSubscriptionByAccountId(db, account.id);
      if (sub?.provider_subscription_id) {
        await svc.syncSubscriptionFromProvider(
          db, provider, sub.id, sub.provider_subscription_id, account.id,
        );
      }

      const charges = await repo.findOpenChargesByAccountId(db, account.id, 10);
      for (const charge of charges) {
        if (charge.provider_charge_id) {
          await svc.syncChargeFromProvider(db, provider, charge.provider_charge_id);
        }
      }

      // Dunning: re-ler conta e subscription após sync — evitar snapshot stale
      const { data: freshAccount } = await db
        .from('billing_accounts')
        .select('id, lifecycle_status, past_due_since')
        .eq('id', account.id)
        .maybeSingle();

      if (!freshAccount) {
        log('warn', 'billing-sync', 'account_disappeared_after_sync', { account_id: account.id });
      } else if (freshAccount.lifecycle_status === 'past_due' && freshAccount.past_due_since) {
        const daysPastDue = Math.floor(
          (Date.now() - new Date(freshAccount.past_due_since).getTime()) / 86_400_000,
        );
        const threshold = Math.max(1, dunningThreshold);

        if (daysPastDue >= threshold) {
          const { data: overdueSub } = await db
            .from('billing_subscriptions')
            .select('id, provider_subscription_id')
            .eq('billing_account_id', freshAccount.id)
            .eq('billing_status', 'overdue')
            .maybeSingle();

          if (overdueSub?.provider_subscription_id) {
            try {
              await provider.suspendSubscription({ providerSubscriptionId: overdueSub.provider_subscription_id });
              const now = new Date().toISOString();
              await db.from('billing_subscriptions')
                .update({ billing_status: 'suspended', updated_at: now })
                .eq('id', overdueSub.id);
              await db.from('billing_accounts')
                .update({
                  is_billing_blocked: true,
                  billing_blocked_reason: 'billing_delinquent',
                  past_due_since: null,
                  updated_at: now,
                })
                .eq('id', freshAccount.id);
              log('warn', 'billing-sync', 'dunning_auto_suspended', {
                account_id: freshAccount.id, days_past_due: daysPastDue,
              });
              auto_suspended++;
            } catch (dErr) {
              log('error', 'billing-sync', 'dunning_suspend_failed', {
                account_id: freshAccount.id, err: String(dErr),
              });
            }
          }
        }
      }

      try {
        await syncBillingSummaryToRuntime(db, account.admin_client_id);
      } catch (e) {
        console.error(`[billing-sync] summary sync failed for account ${account.id}:`, e);
      }

      results.push({ accountId: account.id, ok: true });
    } catch (err) {
      log('error', 'billing-sync', 'account_sync_failed', { account_id: account.id, err: String(err) });
      results.push({ accountId: account.id, ok: false, error: String(err) });
    }
  }

  const synced = results.filter((r) => r.ok).length;
  log('info', 'billing-sync', 'done', {
    accounts_total: accounts.length, synced,
    failed: accounts.length - synced,
    auto_suspended,
    duration_ms: Date.now() - t0,
  });
  return json({ synced, total: accounts.length, auto_suspended, results });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

// @ts-expect-error: Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const db = createClient(
    // @ts-expect-error: Deno global
    Deno.env.get('SUPABASE_URL') ?? '',
    // @ts-expect-error: Deno global
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    await validateAdminSession(req, db);

    const body = await req.json() as { action?: string };
    const action = body?.action;

    if (action === 'sync_all') {
      const t0 = Date.now();
      log('info', 'billing-sync', 'start', { action });

      const config = await loadBillingProviderConfig(db);
      log('info', 'billing-sync', 'provider config', { provider: config.provider, source: config.source, sandbox: config.sandbox });

      if (config.provider !== 'asaas') {
        log('warn', 'billing-sync', 'provider not asaas — skipping sync', { provider: config.provider });
        return json({ synced: 0, total: 0, results: [], skipped: true });
      }
      if (!config.apiKey) {
        throw createHttpError('API key não configurada — configure via Admin > Settings', 500);
      }

      const provider = new AsaasAdapter(new AsaasClient(config.apiKey, config.sandbox));
      return await handleSyncAll(db, provider, config.dunning_days_threshold, t0);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return handleError(err);
  }
});
