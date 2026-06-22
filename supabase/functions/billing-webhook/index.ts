// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';
import * as svc from '../_shared/billing/billing-service.ts';
import { syncBillingSummaryToRuntime } from '../_shared/billing/projection-service.ts';
import { log } from '../_shared/billing/logger.ts';
import { loadBillingProviderConfig } from '../_shared/billing/provider-config.ts';

// Eventos do Asaas que o sistema processa. Qualquer outro retorna 200 imediatamente
// sem gravar em billing_events — evita poluição do inbox e ciclos de retry sem sentido.
const SUPPORTED_ASAAS_EVENTS = new Set([
  // Pagamentos
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED_IN_CASH',
  'PAYMENT_DUNNING_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED',   // estorno parcial → charge.cancelled
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_BANK_SLIP_CANCELLED',  // boleto expirado → charge.cancelled
  // Assinaturas
  'SUBSCRIPTION_DELETED',         // parsing estava silenciosamente quebrado — agora corrigido
  'SUBSCRIPTION_INACTIVATED',     // inativação por retries esgotados → subscription.cancelled
  // SUBSCRIPTION_RENEWED omitido: não existe na API Asaas (docs/subscription-events.md)
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// @ts-expect-error: Deno global
Deno.serve(async (req: Request) => {
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

  // Step 1: load config — single source for this entire request
  const config = await loadBillingProviderConfig(db);
  log('info', 'billing-webhook', 'config loaded', { provider: config.provider, source: config.source });

  // Step 2: validate that asaas is actually configured when expected
  if (config.provider !== 'asaas') {
    log('warn', 'billing-webhook', 'provider not asaas — ignoring webhook', { provider: config.provider });
    return json({ received: true, ignored: true, reason: 'provider_not_asaas' });
  }
  if (!config.apiKey) {
    log('error', 'billing-webhook', 'API key not configured', {});
    return json({ error: 'Provider not configured' }, 500);
  }

  // Step 3: instantiate provider with the same config that was loaded
  const provider = new AsaasAdapter(
    new AsaasClient(config.apiKey, config.sandbox),
    config.webhookToken,
  );

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  let eventId: string | undefined;
  const t0 = Date.now();

  try {
    // Step 4: validate token + parse event (uses the webhook token from config above)
    const event = provider.parseWebhookEvent({ rawBody, headers });

    if (!SUPPORTED_ASAAS_EVENTS.has(event.rawEventType)) {
      log('info', 'billing-webhook', 'ignored', { event_type: event.rawEventType });
      return json({ received: true, ignored: true, reason: 'unsupported_event_type' });
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    // Step 5: record + apply
    const { alreadyProcessed, eventId: eid } = await svc.recordWebhookEvent(db, {
      ...event,
      provider: provider.name,
      payload,
    });
    eventId = eid;

    if (alreadyProcessed) {
      log('info', 'billing-webhook', 'duplicate', { event_type: event.eventType, provider_event_id: event.providerEventId });
      return json({ received: true, duplicate: true });
    }

    await svc.applyWebhookEvent(db, eventId, event);

    // Sync billing_summary to runtime after state change so Web tab reflects immediately.
    // Resolve admin_client_id from whichever identifier the event carries.
    try {
      let adminClientId: string | null = null;

      if (event.providerChargeId) {
        const { data: charge } = await db
          .from('billing_charges')
          .select('billing_account_id')
          .eq('provider_charge_id', event.providerChargeId)
          .maybeSingle();
        if (charge) {
          const { data: account } = await db
            .from('billing_accounts')
            .select('admin_client_id')
            .eq('id', charge.billing_account_id)
            .maybeSingle();
          adminClientId = account?.admin_client_id ?? null;
        }
      } else if (event.providerSubscriptionId) {
        const { data: sub } = await db
          .from('billing_subscriptions')
          .select('billing_account_id')
          .eq('provider_subscription_id', event.providerSubscriptionId)
          .maybeSingle();
        if (sub) {
          const { data: account } = await db
            .from('billing_accounts')
            .select('admin_client_id')
            .eq('id', sub.billing_account_id)
            .maybeSingle();
          adminClientId = account?.admin_client_id ?? null;
        }
      }

      if (adminClientId) {
        await syncBillingSummaryToRuntime(db, adminClientId);
      }
    } catch (syncErr) {
      log('error', 'billing-webhook', 'summary_sync_failed', { event_id: eventId, err: String(syncErr) });
      // Non-fatal: event was applied correctly, projection failure must not cause retry
    }

    log('info', 'billing-webhook', 'done', {
      event_type: event.eventType,
      provider_event_id: event.providerEventId,
      duration_ms: Date.now() - t0,
    });
    return json({ received: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid webhook token') {
      return json({ error: 'Unauthorized' }, 401);
    }

    log('error', 'billing-webhook', 'error', { event_id: eventId, err: String(err), duration_ms: Date.now() - t0 });
    return json({ error: String(err) }, 500);
  }
});
