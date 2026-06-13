// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';
import * as svc from '../_shared/billing/billing-service.ts';
import * as repo from '../_shared/billing/repositories.ts';

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

async function handleSyncAll(db: SupabaseClient) {
  // @ts-expect-error: Deno global
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  if (!apiKey) throw createHttpError('ASAAS_API_KEY not configured', 500);

  // @ts-expect-error: Deno global
  const sandbox = Deno.env.get('ASAAS_SANDBOX') !== 'false';

  const provider = new AsaasAdapter(new AsaasClient(apiKey, sandbox));

  const accounts = await repo.findAccountsForSync(db);

  const results: { accountId: string; ok: boolean; error?: string }[] = [];

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

      results.push({ accountId: account.id, ok: true });
    } catch (err) {
      console.error(`[billing-sync] account ${account.id} sync failed:`, err);
      results.push({ accountId: account.id, ok: false, error: String(err) });
    }
  }

  return json({
    synced: results.filter((r) => r.ok).length,
    total: accounts.length,
    results,
  });
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
      return await handleSyncAll(db);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return handleError(err);
  }
});
