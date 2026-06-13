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
import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Stub provider ────────────────────────────────────────────────────────────
// Replaced by AsaasAdapter in Marco 4 — swap only this class.

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

function createProvider(): BillingProvider {
  const providerName = Deno.env.get('BILLING_PROVIDER') ?? 'stub';
  if (providerName === 'stub') return new StubBillingProvider();
  if (providerName === 'asaas') {
    const apiKey = Deno.env.get('ASAAS_API_KEY');
    if (!apiKey) throw createHttpError('ASAAS_API_KEY not configured', 500);
    const sandbox = Deno.env.get('ASAAS_SANDBOX') !== 'false'; // default: sandbox=true
    const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
    return new AsaasAdapter(new AsaasClient(apiKey, sandbox), webhookToken);
  }
  throw new Error(`Unknown BILLING_PROVIDER: ${providerName}. Configure BILLING_PROVIDER=asaas.`);
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

// ─── Action handlers ──────────────────────────────────────────────────────────

async function handleProvisionAccount(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  assert(params.plan_id, 'plan_id');
  assert(params.customer_name, 'customer_name');
  assert(params.customer_email, 'customer_email');
  assert(params.customer_cpf_cnpj, 'customer_cpf_cnpj');

  return svc.provisionBillingAccount(db, provider, {
    adminClientId: params.admin_client_id as string,
    planId: params.plan_id as string,
    customerInfo: {
      name: params.customer_name as string,
      email: params.customer_email as string,
      cpfCnpj: params.customer_cpf_cnpj as string,
      phone: params.customer_phone as string | undefined,
    },
  });
}

async function handleStartTrial(db: SupabaseClient, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  const trialDays = typeof params.trial_days === 'number' ? params.trial_days : 7;

  return svc.startTrial(db, {
    adminClientId: params.admin_client_id as string,
    trialDays,
  });
}

async function handleCreateSubscription(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  assert(params.plan_id, 'plan_id');
  assert(params.interval, 'interval');
  assert(params.amount, 'amount');
  assert(params.next_due_date, 'next_due_date');

  const interval = assertDomain(params.interval, 'interval', VALID_INTERVALS);

  return svc.createInitialSubscription(db, provider, {
    adminClientId: params.admin_client_id as string,
    planId: params.plan_id as string,
    interval: interval as 'monthly' | 'annual',
    amount: params.amount as number,
    nextDueDate: params.next_due_date as string,
    description: params.description as string | undefined,
  });
}

async function handleCancelSubscription(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.subscription_id, 'subscription_id');
  return svc.cancelSubscription(db, provider, params.subscription_id as string);
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

  return svc.createOneOffCharge(db, provider, {
    adminClientId: params.admin_client_id as string,
    amount: params.amount as number,
    dueDate: params.due_date as string,
    description: params.description as string,
    type: chargeType as 'one_off' | 'adjustment' | 'tier_upgrade',
    billingType: billingType as 'BOLETO' | 'PIX' | 'CREDIT_CARD',
  });
}

async function handleCancelCharge(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.provider_charge_id, 'provider_charge_id');

  // Cancel at provider level
  await provider.cancelCharge({ providerChargeId: params.provider_charge_id as string });

  // Update local record
  const { error } = await db
    .from('billing_charges')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('provider_charge_id', params.provider_charge_id as string);
  if (error) throw createHttpError(`billing_charges update failed: ${error.message}`, 500);

  return { cancelled: true };
}

async function handleGeneratePortalToken(db: SupabaseClient, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');

  const token = await svc.issuePortalToken(db, {
    adminClientId: params.admin_client_id as string,
    chargeId: params.charge_id as string | undefined,
    expiresInHours: params.expires_in_hours as number | undefined,
  });

  // Return only the token value — never log it
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

  // Sync pending/overdue charges (up to 10)
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

  // Sync active subscription (if any) — also propagates lifecycle_status to billing_accounts
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

  return {
    synced_charges: syncedCharges.length,
    provider_charge_ids: syncedCharges,
    synced_subscription: syncedSubscription,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseKey) {
      throw createHttpError('Internal configuration error: missing env vars', 500);
    }

    const db = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await validateAdminSession(req, db);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const { action, params = {} } = body as { action?: string; params?: Record<string, unknown> };

    if (!action) throw createHttpError('Missing action in request body', 400);

    console.log(`[billing-action] action=${action}`);

    const provider = createProvider();
    let result: unknown;

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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return handleError(err);
  }
});
