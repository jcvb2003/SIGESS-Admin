// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import type { BillingProvider } from '../_shared/billing/provider.interface.ts';
import type {
  BillingWebhookEvent,
  ProviderCharge,
  ProviderCustomer,
  ProviderSubscription,
} from '../_shared/billing/types.ts';
import * as svc from '../_shared/billing/billing-service.ts';
import { syncBillingSummaryToRuntime } from '../_shared/billing/projection-service.ts';
import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';
import { log } from '../_shared/billing/logger.ts';
import { loadBillingProviderConfig } from '../_shared/billing/provider-config.ts';

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Stub provider ────────────────────────────────────────────────────────────

class StubBillingProvider implements BillingProvider {
  readonly name = 'stub';

  async ensureCustomer(): Promise<ProviderCustomer> {
    return { providerCustomerId: `stub_cust_${crypto.randomUUID()}` };
  }
  async createSubscription(input: Parameters<BillingProvider['createSubscription']>[0]): Promise<ProviderSubscription> {
    return {
      providerSubscriptionId: `stub_sub_${crypto.randomUUID()}`,
      billingStatus: 'pending_payment',
      nextBillingDate: input.nextDueDate,
    };
  }
  async cancelSubscription(): Promise<void> {}
  async createCharge(input: Parameters<BillingProvider['createCharge']>[0]): Promise<ProviderCharge> {
    return {
      providerChargeId: `stub_chrg_${crypto.randomUUID()}`,
      status: 'pending',
      amount: input.amount,
      dueDate: input.dueDate,
      paymentUrl: `https://stub.sigess.billing/${crypto.randomUUID()}`,
    };
  }
  async cancelCharge(): Promise<void> {}
  async fetchSubscription(input: Parameters<BillingProvider['fetchSubscription']>[0]): Promise<ProviderSubscription> {
    return { providerSubscriptionId: input.providerSubscriptionId, billingStatus: 'active' };
  }
  async fetchCharge(input: Parameters<BillingProvider['fetchCharge']>[0]): Promise<ProviderCharge> {
    return {
      providerChargeId: input.providerChargeId,
      status: 'pending',
      amount: 0,
      dueDate: new Date().toISOString().split('T')[0],
    };
  }
  parseWebhookEvent(): BillingWebhookEvent {
    throw new Error('StubBillingProvider does not handle webhooks');
  }
}

function createProvider(config: { provider: string; apiKey?: string; sandbox: boolean; webhookToken?: string }): BillingProvider {
  if (config.provider === 'stub') return new StubBillingProvider();
  if (config.provider === 'asaas') {
    if (!config.apiKey) throw createHttpError('ASAAS_API_KEY não configurado — configure via Admin > Settings', 500);
    return new AsaasAdapter(new AsaasClient(config.apiKey, config.sandbox), config.webhookToken);
  }
  throw new Error(`Unknown BILLING_PROVIDER: ${config.provider}. Configure via Admin > Settings.`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createHttpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function assert(value: unknown, fieldName: string): asserts value {
  if (value === undefined || value === null || value === '') {
    throw createHttpError(`Missing required field: ${fieldName}`, 400);
  }
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

  console.error(`[billing-action] Error [${status}]:`, message);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function validateAdminSession(req: Request, db: SupabaseClient) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw createHttpError('Missing Authorization header', 401);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) throw createHttpError('Unauthorized', 401);
  return user;
}

// ─── Domain validators ────────────────────────────────────────────────────────

const VALID_INTERVALS = new Set(['monthly', 'annual']);
const VALID_CHARGE_TYPES = new Set(['one_off', 'adjustment', 'tier_upgrade']);
const VALID_BILLING_TYPES = new Set(['BOLETO', 'PIX', 'CREDIT_CARD']);

function assertDomain(value: unknown, fieldName: string, allowed: Set<string>): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw createHttpError(
      `Invalid value for ${fieldName}: "${value}". Allowed: ${[...allowed].join(', ')}`,
      400,
    );
  }
  return value;
}

// ─── Summary sync helper ──────────────────────────────────────────────────────

async function trySyncSummary(db: SupabaseClient, adminClientId: string): Promise<void> {
  try {
    await syncBillingSummaryToRuntime(db, adminClientId);
  } catch (e) {
    console.error('[billing-action] summary sync failed for', adminClientId, ':', e);
  }
}

// ─── Global config action handlers ───────────────────────────────────────────

async function handleGetProviderSettings(db: SupabaseClient) {
  const { data, error } = await db
    .from('billing_provider_settings')
    .select('provider, sandbox, api_key, webhook_token, updated_at, updated_by')
    .eq('id', 'default')
    .maybeSingle();

  if (error) throw createHttpError(`provider_settings read failed: ${error.message}`, 500);

  if (!data) {
    // Fallback metadata from env — no DB row yet
    // @ts-expect-error: Deno global
    const envProvider = Deno.env.get('BILLING_PROVIDER') ?? 'stub';
    // @ts-expect-error: Deno global
    const envApiKey = Deno.env.get('ASAAS_API_KEY');
    // @ts-expect-error: Deno global
    const envWebhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
    // @ts-expect-error: Deno global
    const envSandbox = Deno.env.get('ASAAS_SANDBOX') !== 'false';
    return {
      provider: envProvider,
      sandbox: envSandbox,
      api_key_configured: Boolean(envApiKey),
      webhook_token_configured: Boolean(envWebhookToken),
      updated_at: null,
      updated_by: null,
      source: 'env',
    };
  }

  return {
    provider: data.provider,
    sandbox: data.sandbox,
    api_key_configured: data.api_key !== null && data.api_key !== '',
    webhook_token_configured: data.webhook_token !== null && data.webhook_token !== '',
    updated_at: data.updated_at,
    updated_by: data.updated_by,
    source: 'db',
  };
}

async function handleUpsertProviderSettings(
  db: SupabaseClient,
  user: { email?: string },
  params: Record<string, unknown>,
) {
  if (typeof params.provider !== 'string') throw createHttpError('Missing required field: provider', 400);
  if (typeof params.sandbox !== 'boolean') throw createHttpError('Missing required field: sandbox', 400);

  const payload: Record<string, unknown> = {
    id: 'default',
    provider: params.provider,
    sandbox: params.sandbox,
    updated_at: new Date().toISOString(),
    updated_by: user.email ?? null,
  };

  // Only include secrets if the caller sent a non-empty string — never overwrite with empty/null
  if (typeof params.api_key === 'string' && params.api_key.trim()) {
    payload.api_key = params.api_key.trim();
  }
  if (typeof params.webhook_token === 'string' && params.webhook_token.trim()) {
    payload.webhook_token = params.webhook_token.trim();
  }

  const { error } = await db.from('billing_provider_settings').upsert(payload, { onConflict: 'id' });
  if (error) throw createHttpError(`provider_settings upsert failed: ${error.message}`, 500);

  log('info', 'billing-action', 'upsert_provider_settings', {
    provider: params.provider,
    sandbox: params.sandbox,
    updated_by: user.email ?? null,
  });

  return { ok: true };
}

// ─── Account action handlers ──────────────────────────────────────────────────

async function handleProvisionAccount(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  assert(params.plan_id, 'plan_id');
  assert(params.customer_name, 'customer_name');
  assert(params.customer_email, 'customer_email');
  assert(params.customer_cpf_cnpj, 'customer_cpf_cnpj');

  const { account, created, pending } = await svc.provisionBillingAccount(db, provider, {
    adminClientId: params.admin_client_id as string,
    planId: params.plan_id as string,
    customerInfo: {
      name: params.customer_name as string,
      email: params.customer_email as string,
      cpfCnpj: params.customer_cpf_cnpj as string,
      phone: params.customer_phone as string | undefined,
    },
  });
  log('info', 'billing-action', 'provision_account', {
    admin_client_id: params.admin_client_id as string,
    account_id: account.id,
    created,
    pending,
  });
  if (!pending) await trySyncSummary(db, params.admin_client_id as string);
  return { ...account, created, pending };
}

async function handleStartTrial(db: SupabaseClient, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  const trialDays = typeof params.trial_days === 'number' ? params.trial_days : 7;

  const result = await svc.startTrial(db, {
    adminClientId: params.admin_client_id as string,
    trialDays,
  });
  await trySyncSummary(db, params.admin_client_id as string);
  return result;
}

async function handleCreateSubscription(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  assert(params.plan_id, 'plan_id');
  assert(params.interval, 'interval');
  assert(params.amount, 'amount');
  assert(params.next_due_date, 'next_due_date');

  const interval = assertDomain(params.interval, 'interval', VALID_INTERVALS);

  const result = await svc.createInitialSubscription(db, provider, {
    adminClientId: params.admin_client_id as string,
    planId: params.plan_id as string,
    interval: interval as 'monthly' | 'annual',
    amount: params.amount as number,
    nextDueDate: params.next_due_date as string,
    description: params.description as string | undefined,
  });
  await trySyncSummary(db, params.admin_client_id as string);
  return result;
}

async function handleCancelSubscription(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.subscription_id, 'subscription_id');
  const subId = params.subscription_id as string;

  const { data: sub } = await db
    .from('billing_subscriptions')
    .select('billing_account_id')
    .eq('id', subId)
    .maybeSingle();
  const { data: account } = sub?.billing_account_id
    ? await db.from('billing_accounts').select('admin_client_id').eq('id', sub.billing_account_id).maybeSingle()
    : { data: null };

  const result = await svc.cancelSubscription(db, provider, subId);
  if (account?.admin_client_id) await trySyncSummary(db, account.admin_client_id);
  return result;
}

async function handleCreateCharge(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  assert(params.amount, 'amount');
  assert(params.due_date, 'due_date');
  assert(params.description, 'description');

  const chargeType = params.type !== undefined
    ? assertDomain(params.type, 'type', VALID_CHARGE_TYPES)
    : 'one_off';
  const billingType = params.billing_type !== undefined
    ? assertDomain(params.billing_type, 'billing_type', VALID_BILLING_TYPES)
    : 'BOLETO';

  const result = await svc.createOneOffCharge(db, provider, {
    adminClientId: params.admin_client_id as string,
    amount: params.amount as number,
    dueDate: params.due_date as string,
    description: params.description as string,
    type: chargeType as 'one_off' | 'adjustment' | 'tier_upgrade',
    billingType: billingType as 'BOLETO' | 'PIX' | 'CREDIT_CARD',
  });
  await trySyncSummary(db, params.admin_client_id as string);
  return result;
}

async function handleCancelCharge(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.provider_charge_id, 'provider_charge_id');
  const providerChargeId = params.provider_charge_id as string;

  const { data: charge } = await db
    .from('billing_charges')
    .select('billing_account_id')
    .eq('provider_charge_id', providerChargeId)
    .maybeSingle();
  const { data: account } = charge?.billing_account_id
    ? await db.from('billing_accounts').select('admin_client_id').eq('id', charge.billing_account_id).maybeSingle()
    : { data: null };

  await provider.cancelCharge({ providerChargeId });

  const { error } = await db
    .from('billing_charges')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('provider_charge_id', providerChargeId);
  if (error) throw createHttpError(`billing_charges update failed: ${error.message}`, 500);

  if (account?.admin_client_id) await trySyncSummary(db, account.admin_client_id);

  return { cancelled: true };
}

async function handleGeneratePortalToken(db: SupabaseClient, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');

  const token = await svc.issuePortalToken(db, {
    adminClientId: params.admin_client_id as string,
    chargeId: params.charge_id as string | undefined,
    expiresInHours: params.expires_in_hours as number | undefined,
  });

  return { token: token.token, expires_at: token.expires_at };
}

async function handleSyncAccount(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');

  const { data: account } = await db
    .from('billing_accounts')
    .select('id')
    .eq('admin_client_id', params.admin_client_id as string)
    .maybeSingle();

  if (!account) throw createHttpError('billing_account not found', 404);

  const { data: charges } = await db
    .from('billing_charges')
    .select('provider_charge_id')
    .eq('billing_account_id', account.id)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: false })
    .limit(10);

  const syncedCharges: string[] = [];
  for (const charge of (charges ?? [])) {
    if (!charge.provider_charge_id) continue;
    await svc.syncChargeFromProvider(db, provider, charge.provider_charge_id);
    syncedCharges.push(charge.provider_charge_id);
  }

  const { data: activeSub } = await db
    .from('billing_subscriptions')
    .select('id, provider_subscription_id, billing_account_id')
    .eq('billing_account_id', account.id)
    .in('billing_status', ['active', 'trialing', 'pending_payment', 'overdue'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let syncedSubscription: string | null = null;
  if (activeSub?.provider_subscription_id) {
    await svc.syncSubscriptionFromProvider(
      db,
      provider,
      activeSub.id,
      activeSub.provider_subscription_id,
      activeSub.billing_account_id,
    );
    syncedSubscription = activeSub.provider_subscription_id;
  }

  const result = {
    synced_charges: syncedCharges.length,
    provider_charge_ids: syncedCharges,
    synced_subscription: syncedSubscription,
  };
  await trySyncSummary(db, params.admin_client_id as string);
  return result;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    // @ts-expect-error: Deno global
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // @ts-expect-error: Deno global
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseKey) {
      throw createHttpError('Internal configuration error: missing env vars', 500);
    }

    const db = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const user = await validateAdminSession(req, db);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { action, params = {} } = body as { action?: string; params?: Record<string, unknown> };

    if (!action) throw createHttpError('Missing action in request body', 400);

    const t0 = Date.now();
    log('info', 'billing-action', 'start', { action, admin_client_id: (params as Record<string, unknown>).admin_client_id });

    let result: unknown;

    // Global config actions — no provider needed
    if (action === 'get_provider_settings') {
      result = await handleGetProviderSettings(db);
      log('info', 'billing-action', 'done', { action, duration_ms: Date.now() - t0 });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'upsert_provider_settings') {
      result = await handleUpsertProviderSettings(db, user, params);
      log('info', 'billing-action', 'done', { action, duration_ms: Date.now() - t0 });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Provider-dependent actions
    const config = await loadBillingProviderConfig(db);
    log('info', 'billing-action', 'provider config', { provider: config.provider, source: config.source, sandbox: config.sandbox });
    const provider = createProvider(config);

    switch (action) {
      case 'provision_account':
        result = await handleProvisionAccount(db, provider, params);
        break;
      case 'start_trial':
        result = await handleStartTrial(db, params);
        break;
      case 'create_subscription':
        result = await handleCreateSubscription(db, provider, params);
        break;
      case 'cancel_subscription':
        result = await handleCancelSubscription(db, provider, params);
        break;
      case 'create_charge':
        result = await handleCreateCharge(db, provider, params);
        break;
      case 'cancel_charge':
        result = await handleCancelCharge(db, provider, params);
        break;
      case 'generate_portal_token':
        result = await handleGeneratePortalToken(db, params);
        break;
      case 'sync_account':
        result = await handleSyncAccount(db, provider, params);
        break;
      default:
        throw createHttpError(`Unknown action: ${action}`, 400);
    }

    log('info', 'billing-action', 'done', { action, duration_ms: Date.now() - t0 });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return handleError(err);
  }
});
