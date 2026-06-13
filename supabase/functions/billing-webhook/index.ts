// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';
import * as svc from '../_shared/billing/billing-service.ts';

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

  try {
    const event = provider.parseWebhookEvent({ rawBody, headers });

    const payload = JSON.parse(rawBody) as Record<string, unknown>;

    const { alreadyProcessed, eventId: eid } = await svc.recordWebhookEvent(db, {
      ...event,
      provider: provider.name,
      payload,
    });
    eventId = eid;

    if (alreadyProcessed) {
      return json({ received: true, duplicate: true });
    }

    await svc.applyWebhookEvent(db, eventId, event);

    return json({ received: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid webhook token') {
      return json({ error: 'Unauthorized' }, 401);
    }

    // applyWebhookEvent already called markEventFailed internally before re-throwing.
    // Return 500 so Asaas retries; existingStatus='failed' allows re-apply on next attempt.
    // Retry containment depends on Asaas retry policy and/or manual billing-sync.
    console.error('[billing-webhook] Error:', err, { eventId });
    return json({ error: String(err) }, 500);
  }
});
