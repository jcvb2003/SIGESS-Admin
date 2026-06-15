// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';
import * as svc from '../_shared/billing/billing-service.ts';
import { log } from '../_shared/billing/logger.ts';

// Eventos do Asaas que o sistema processa. Qualquer outro retorna 200 imediatamente
// sem gravar em billing_events — evita poluição do inbox e ciclos de retry sem sentido.
const SUPPORTED_ASAAS_EVENTS = new Set([
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED_IN_CASH',
  'PAYMENT_DUNNING_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'SUBSCRIPTION_RENEWED',
  'SUBSCRIPTION_DELETED',
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

  // @ts-expect-error: Deno global
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  if (!apiKey) {
    console.error('[billing-webhook] ASAAS_API_KEY not configured');
    return json({ error: 'Provider not configured' }, 500);
  }

  // @ts-expect-error: Deno global
  const sandbox = Deno.env.get('ASAAS_SANDBOX') !== 'false';
  // @ts-expect-error: Deno global
  const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');

  const db = createClient(
    // @ts-expect-error: Deno global
    Deno.env.get('SUPABASE_URL') ?? '',
    // @ts-expect-error: Deno global
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const rawBody = await req.text();

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  const provider = new AsaasAdapter(new AsaasClient(apiKey, sandbox), webhookToken);

  let eventId: string | undefined;
  const t0 = Date.now();

  try {
    const event = provider.parseWebhookEvent({ rawBody, headers });

    if (!SUPPORTED_ASAAS_EVENTS.has(event.rawEventType)) {
      log('info', 'billing-webhook', 'ignored', { event_type: event.rawEventType });
      return json({ received: true, ignored: true, reason: 'unsupported_event_type' });
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;

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
