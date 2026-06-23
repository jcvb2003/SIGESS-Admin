// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import type { BillingProvider } from '../_shared/billing/provider.interface.ts';
import type {
  BillingDriftNote,
  BillingWebhookEvent,
  CommercialMode,
  ProviderCharge,
  ProviderCustomer,
  ProviderSubscription,
} from '../_shared/billing/types.ts';
import * as repo from '../_shared/billing/repositories.ts';
import * as svc from '../_shared/billing/billing-service.ts';
import { syncBillingSummaryToRuntime } from '../_shared/billing/projection-service.ts';
import { AsaasClient } from '../_shared/billing/asaas-client.ts';
import { AsaasAdapter } from '../_shared/billing/asaas-adapter.ts';
import { AsaasApiError } from '../_shared/billing/asaas-client.ts';
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
  async updateSubscription(input: Parameters<BillingProvider['updateSubscription']>[0]): Promise<ProviderSubscription> {
    return {
      providerSubscriptionId: input.providerSubscriptionId,
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
  async updateChargeDueDate(): Promise<void> {}
  async suspendSubscription(): Promise<void> {}
  async resumeSubscription(): Promise<void> {}
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
  async listSubscriptionCharges(): Promise<ProviderCharge[]> {
    return [];
  }
  async customerExists(): Promise<boolean> {
    return true; // stub assume que o cliente existe
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

const VALID_INTERVALS     = new Set(['monthly', 'annual']);
const VALID_CHARGE_TYPES  = new Set(['one_off', 'adjustment', 'tier_upgrade']);
const VALID_BILLING_TYPES = new Set(['BOLETO', 'PIX', 'CREDIT_CARD']);
const VALID_MODES         = new Set(['manual', 'recorrente_mensal', 'anual']);
const VALID_BLOCK_REASONS = new Set(['billing_delinquent', 'manual_suspend']);

function assertDomain(value: unknown, fieldName: string, allowed: Set<string>): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw createHttpError(
      `Invalid value for ${fieldName}: "${value}". Allowed: ${[...allowed].join(', ')}`,
      400,
    );
  }
  return value;
}

function isProviderNotFound(err: unknown): err is AsaasApiError {
  return err instanceof AsaasApiError && err.status === 404;
}

// ─── Summary sync helper ──────────────────────────────────────────────────────

async function syncSummaryOrThrow(db: SupabaseClient, adminClientId: string): Promise<void> {
  try {
    await syncBillingSummaryToRuntime(db, adminClientId);
  } catch (e) {
    console.error('[billing-action] summary sync failed for', adminClientId, ':', e);
    const detail = e instanceof Error ? e.message : String(e);
    throw createHttpError(`Falha ao sincronizar billing_summary: ${detail}`, 500);
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
  assert(params.customer_name, 'customer_name');
  assert(params.customer_email, 'customer_email');
  assert(params.customer_cpf_cnpj, 'customer_cpf_cnpj');

  const { account, created, pending } = await svc.provisionBillingAccount(db, provider, {
    adminClientId: params.admin_client_id as string,
    startAsTrial: params.start_as_trial === true,
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
  if (!pending) await syncSummaryOrThrow(db, params.admin_client_id as string);
  return { ...account, created, pending };
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
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return result;
}

async function handleChangeSubscriptionPlan(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  assert(params.plan_id, 'plan_id');
  assert(params.interval, 'interval');
  assert(params.amount, 'amount');
  assert(params.next_due_date, 'next_due_date');

  const interval = assertDomain(params.interval, 'interval', VALID_INTERVALS);

  await svc.changeSubscriptionPlan(db, provider, {
    adminClientId: params.admin_client_id as string,
    planId: params.plan_id as string,
    interval: interval as 'monthly' | 'annual',
    amount: params.amount as number,
    nextDueDate: params.next_due_date as string,
    description: params.description as string | undefined,
    updatePendingPayments: params.update_pending_payments === true,
  });
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return { updated: true };
}

async function handleCancelSubscription(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.subscription_id, 'subscription_id');
  const subId = params.subscription_id as string;

  const { data: sub } = await db
    .from('billing_subscriptions')
    .select('billing_account_id, billing_status')
    .eq('id', subId)
    .maybeSingle();

  if (!sub) throw createHttpError(`Assinatura '${subId}' não encontrada`, 404);
  if (!['active', 'pending_payment', 'overdue'].includes(sub.billing_status)) {
    throw createHttpError(`Não é possível cancelar assinatura com status '${sub.billing_status}'`, 409);
  }

  const { data: account } = sub?.billing_account_id
    ? await db.from('billing_accounts').select('admin_client_id').eq('id', sub.billing_account_id).maybeSingle()
    : { data: null };

  const result = await svc.cancelSubscription(db, provider, subId);
  if (account?.admin_client_id) await syncSummaryOrThrow(db, account.admin_client_id);
  return result;
}

async function handleSuspendSubscription(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.subscription_id, 'subscription_id');
  const subId = params.subscription_id as string;

  const { data: sub } = await db
    .from('billing_subscriptions')
    .select('id, provider_subscription_id, billing_account_id, billing_status')
    .eq('id', subId)
    .maybeSingle();

  if (!sub) throw createHttpError(`Assinatura '${subId}' não encontrada`, 404);
  if (!sub.provider_subscription_id) throw createHttpError('Subscription sem provider_subscription_id', 409);
  if (!['active', 'overdue'].includes(sub.billing_status)) {
    throw createHttpError(`Não é possível suspender assinatura com status '${sub.billing_status}'`, 409);
  }

  await provider.suspendSubscription({ providerSubscriptionId: sub.provider_subscription_id });

  await repo.updateSubscription(db, sub.id, { billing_status: 'suspended' });
  await repo.updateAccount(db, sub.billing_account_id, {
    lifecycle_status: 'past_due',
    is_billing_blocked: true,
    billing_blocked_reason: 'billing_delinquent',
  });

  const { data: account } = await db
    .from('billing_accounts')
    .select('admin_client_id')
    .eq('id', sub.billing_account_id)
    .maybeSingle();
  if (account?.admin_client_id) await syncSummaryOrThrow(db, account.admin_client_id);

  return { suspended: true };
}

async function handleResumeSubscription(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.subscription_id, 'subscription_id');
  const subId = params.subscription_id as string;

  const { data: sub } = await db
    .from('billing_subscriptions')
    .select('id, provider_subscription_id, billing_account_id, billing_status')
    .eq('id', subId)
    .maybeSingle();

  if (!sub) throw createHttpError(`Assinatura '${subId}' não encontrada`, 404);
  if (!sub.provider_subscription_id) throw createHttpError('Subscription sem provider_subscription_id', 409);
  if (sub.billing_status !== 'suspended') {
    throw createHttpError(`Não é possível reativar assinatura com status '${sub.billing_status}'`, 409);
  }

  await provider.resumeSubscription({ providerSubscriptionId: sub.provider_subscription_id });

  // Buscar estado real do provider em vez de assumir 'active' optimisticamente
  await svc.syncSubscriptionFromProvider(
    db, provider, sub.id, sub.provider_subscription_id, sub.billing_account_id,
  );

  // Limpar bloqueio de billing — não tratado por syncSubscriptionFromProvider
  await repo.updateAccount(db, sub.billing_account_id, {
    is_billing_blocked: false,
    billing_blocked_reason: null,
  });

  const { data: account } = await db
    .from('billing_accounts')
    .select('admin_client_id')
    .eq('id', sub.billing_account_id)
    .maybeSingle();
  if (account?.admin_client_id) await syncSummaryOrThrow(db, account.admin_client_id);

  return { resumed: true };
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
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return result;
}

async function handleCancelCharge(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.provider_charge_id, 'provider_charge_id');
  const providerChargeId = params.provider_charge_id as string;

  const { data: charge } = await db
    .from('billing_charges')
    .select('billing_account_id, status')
    .eq('provider_charge_id', providerChargeId)
    .maybeSingle();

  if (!charge) throw createHttpError(`Cobrança com provider_charge_id '${providerChargeId}' não encontrada`, 404);
  if (!['pending', 'overdue'].includes(charge.status)) {
    throw createHttpError(`Não é possível cancelar cobrança com status '${charge.status}'. Apenas 'pending' ou 'overdue' podem ser canceladas.`, 409);
  }

  const { data: account } = charge?.billing_account_id
    ? await db.from('billing_accounts').select('admin_client_id').eq('id', charge.billing_account_id).maybeSingle()
    : { data: null };

  await provider.cancelCharge({ providerChargeId });

  const { error } = await db
    .from('billing_charges')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('provider_charge_id', providerChargeId);
  if (error) throw createHttpError(`billing_charges update failed: ${error.message}`, 500);

  if (account?.admin_client_id) await syncSummaryOrThrow(db, account.admin_client_id);

  return { cancelled: true };
}

async function handleProrrogarCharge(db: SupabaseClient, provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.provider_charge_id, 'provider_charge_id');
  assert(params.new_due_date, 'new_due_date');

  const providerChargeId = params.provider_charge_id as string;
  const newDueDate = params.new_due_date as string;

  const { data: charge } = await db
    .from('billing_charges')
    .select('billing_account_id, status, due_date')
    .eq('provider_charge_id', providerChargeId)
    .maybeSingle();

  if (!charge) throw createHttpError(`Cobrança '${providerChargeId}' não encontrada`, 404);
  if (!['pending', 'overdue'].includes(charge.status)) {
    throw createHttpError(`Não é possível prorrogar cobrança com status '${charge.status}'. Apenas 'pending' ou 'overdue' são permitidas.`, 409);
  }

  const { data: account } = await db
    .from('billing_accounts')
    .select('admin_client_id')
    .eq('id', charge.billing_account_id)
    .maybeSingle();

  await provider.updateChargeDueDate({ providerChargeId, newDueDate });

  const { error } = await db
    .from('billing_charges')
    .update({ due_date: newDueDate, updated_at: new Date().toISOString() })
    .eq('provider_charge_id', providerChargeId);
  if (error) throw createHttpError(`billing_charges update failed: ${error.message}`, 500);

  if (account?.admin_client_id) await syncSummaryOrThrow(db, account.admin_client_id);

  return { prorrogued: true, new_due_date: newDueDate };
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
    .select('id, provider_customer_id')
    .eq('admin_client_id', params.admin_client_id as string)
    .maybeSingle();

  if (!account) throw createHttpError('billing_account not found', 404);

  // Verificar se o cliente ainda existe no provider antes de qualquer sync.
  // Se 404, fechar o account localmente — não há sentido em continuar o sync.
  if (account.provider_customer_id) {
    const exists = await provider.customerExists({ providerCustomerId: account.provider_customer_id });
    if (!exists) {
      const now = new Date().toISOString();
      await db
        .from('billing_subscriptions')
        .update({ billing_status: 'cancelled', ends_at: now, updated_at: now })
        .eq('billing_account_id', account.id)
        .in('billing_status', ['trialing', 'pending_payment', 'active', 'overdue']);

      await db
        .from('billing_accounts')
        .update({ lifecycle_status: 'cancelled', provider_customer_id: null, updated_at: now })
        .eq('id', account.id);

      log('warn', 'billing-action', 'customer_not_found_in_provider_during_sync', {
        admin_client_id: params.admin_client_id,
        account_id: account.id,
        provider_customer_id: account.provider_customer_id,
      });

      await syncSummaryOrThrow(db, params.admin_client_id as string);
      return {
        customer_deleted: true,
        synced_charges: 0,
        discovered_charges: 0,
        provider_charge_ids: [],
        synced_subscription: null,
        drift_note: null,
        missing_remote_charge_ids: [],
        missing_remote_subscription_id: null,
      };
    }
  }

  const { data: charges } = await db
    .from('billing_charges')
    .select('provider_charge_id')
    .eq('billing_account_id', account.id)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: false })
    .limit(10);

  const syncedCharges: string[] = [];
  const missingRemoteChargeIds: string[] = [];
  for (const charge of (charges ?? [])) {
    if (!charge.provider_charge_id) continue;
    try {
      await svc.syncChargeFromProvider(db, provider, charge.provider_charge_id);
      syncedCharges.push(charge.provider_charge_id);
    } catch (err) {
      if (isProviderNotFound(err)) {
        missingRemoteChargeIds.push(charge.provider_charge_id);
        log('warn', 'billing-action', 'missing_remote_charge_during_sync', {
          admin_client_id: params.admin_client_id,
          account_id: account.id,
          provider_charge_id: charge.provider_charge_id,
        });
        continue;
      }
      throw err;
    }
  }

  // Auto-resolver charges órfãs (404 no provider).
  // Premissa: 404 = recurso inexistente, não configuração errada. Válido para provider único, ambiente estável.
  if (missingRemoteChargeIds.length > 0) {
    const { error: cancelErr } = await db
      .from('billing_charges')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .in('provider_charge_id', missingRemoteChargeIds);

    if (cancelErr) {
      log('error', 'billing-action', 'orphaned_charges_cancel_failed', {
        admin_client_id: params.admin_client_id,
        ids: missingRemoteChargeIds,
        err: cancelErr.message,
      });
    } else {
      log('warn', 'billing-action', 'orphaned_charges_auto_cancelled', {
        admin_client_id: params.admin_client_id,
        count: missingRemoteChargeIds.length,
        ids: missingRemoteChargeIds,
      });
    }
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
  let discoveredCharges = 0;
  let missingRemoteSubscriptionId: string | null = null;
  if (activeSub?.provider_subscription_id) {
    try {
      await svc.syncSubscriptionFromProvider(
        db,
        provider,
        activeSub.id,
        activeSub.provider_subscription_id,
        activeSub.billing_account_id,
      );
      syncedSubscription = activeSub.provider_subscription_id;

      // Discover charges that exist in the provider but have no local row yet.
      // This covers the gap between subscription creation and first webhook delivery.
      const providerCharges = await provider.listSubscriptionCharges({
        providerSubscriptionId: activeSub.provider_subscription_id,
      });

      for (const pc of providerCharges) {
        if (pc.status === 'paid' || pc.status === 'cancelled' || pc.status === 'failed') continue;

        const { data: existing } = await db
          .from('billing_charges')
          .select('id')
          .eq('provider_charge_id', pc.providerChargeId)
          .maybeSingle();

        if (!existing) {
          await db.from('billing_charges').insert({
            billing_account_id: account.id,
            subscription_id: activeSub.id,
            provider_charge_id: pc.providerChargeId,
            type: 'subscription_renewal',
            status: pc.status,
            amount: pc.amount,
            due_date: pc.dueDate,
            paid_at: null,   // nunca inserir paid_at retroativo — webhook atualiza quando confirmado
            description: null,
            payment_url: pc.paymentUrl ?? null,
          });
          discoveredCharges++;
        }
      }
    } catch (err) {
      if (isProviderNotFound(err)) {
        missingRemoteSubscriptionId = activeSub.provider_subscription_id;
        log('warn', 'billing-action', 'missing_remote_subscription_during_sync', {
          admin_client_id: params.admin_client_id,
          account_id: account.id,
          provider_subscription_id: activeSub.provider_subscription_id,
        });

        // Auto-resolver: subscription não existe mais no provider — fechar localmente.
        // Premissa: 404 = recurso inexistente, não configuração errada.
        const now = new Date().toISOString();
        const { error: subErr } = await db
          .from('billing_subscriptions')
          .update({ billing_status: 'cancelled', ends_at: now, updated_at: now })
          .eq('id', activeSub.id);

        if (subErr) {
          log('error', 'billing-action', 'orphaned_subscription_cancel_failed', {
            admin_client_id: params.admin_client_id,
            subscription_id: activeSub.id,
            err: subErr.message,
          });
        } else {
          // Regredir account se estava em estado que pressupõe subscription ativa
          const { data: acct, error: acctErr } = await db
            .from('billing_accounts')
            .select('lifecycle_status')
            .eq('id', activeSub.billing_account_id)
            .maybeSingle();

          if (acctErr) {
            log('error', 'billing-action', 'orphaned_subscription_account_lookup_failed', {
              admin_client_id: params.admin_client_id,
              account_id: activeSub.billing_account_id,
              err: acctErr.message,
            });
          } else if (acct && ['active', 'payment_pending', 'past_due'].includes(acct.lifecycle_status)) {
            const { error: acctErr2 } = await db
              .from('billing_accounts')
              .update({ lifecycle_status: 'cancelled', updated_at: now })
              .eq('id', activeSub.billing_account_id);

            if (acctErr2) {
              log('error', 'billing-action', 'orphaned_subscription_account_cancel_failed', {
                admin_client_id: params.admin_client_id,
                account_id: activeSub.billing_account_id,
                err: acctErr2.message,
              });
            } else {
              log('warn', 'billing-action', 'orphaned_subscription_auto_cancelled', {
                admin_client_id: params.admin_client_id,
                subscription_id: activeSub.id,
                account_id: activeSub.billing_account_id,
              });
            }
          }
        }
      } else {
        throw err;
      }
    }
  }

  // Drift detection — classifica divergências operacionais para observabilidade
  // Não corrige automaticamente — estado provider-driven requer revisão manual
  let driftNote: BillingDriftNote | null = null;

  const { data: refreshedAccount } = await db
    .from('billing_accounts')
    .select('lifecycle_status')
    .eq('id', account.id)
    .maybeSingle();

  if (refreshedAccount?.lifecycle_status === 'active') {
    const { data: activeSub } = await db
      .from('billing_subscriptions')
      .select('id')
      .eq('billing_account_id', account.id)
      .in('billing_status', ['active', 'trialing'])
      .limit(1)
      .maybeSingle();
    if (!activeSub) {
      driftNote = 'account_active_but_no_active_subscription';
      log('warn', 'billing-action', 'drift_detected', {
        admin_client_id: params.admin_client_id,
        account_id: account.id,
        drift: driftNote,
      });
    }
  }

  const result = {
    synced_charges: syncedCharges.length,
    discovered_charges: discoveredCharges,
    provider_charge_ids: syncedCharges,
    synced_subscription: syncedSubscription,
    drift_note: driftNote,
    missing_remote_charge_ids: missingRemoteChargeIds,
    missing_remote_subscription_id: missingRemoteSubscriptionId,
  };
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return result;
}

// ─── Planned plan handler ─────────────────────────────────────────────────────

async function handleClearPlannedPlan(db: SupabaseClient, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');

  const account = await repo.findAccountByClientId(db, params.admin_client_id as string);
  if (!account) throw createHttpError('billing_account not found', 404);

  if (!account.next_plan_id) {
    throw createHttpError('Nenhum plano agendado para cancelar.', 409);
  }

  await repo.updateAccount(db, account.id, { next_plan_id: null, next_plan_effective_date: null });
  log('info', 'billing-action', 'clear_planned_plan', { admin_client_id: params.admin_client_id });
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return { ok: true };
}

// ─── Commercial mode + billing block handlers ─────────────────────────────────

async function handleUpdateCommercialMode(db: SupabaseClient, _provider: BillingProvider, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  const newMode = assertDomain(params.commercial_mode, 'commercial_mode', VALID_MODES) as CommercialMode;

  const account = await repo.findAccountByClientId(db, params.admin_client_id as string);
  if (!account) throw createHttpError('billing_account not found', 404);

  if (['recorrente_mensal', 'anual'].includes(account.commercial_mode) && newMode === 'manual') {
    throw createHttpError(
      "Não é possível reverter para manual. Cancele a assinatura ativa primeiro.",
      409,
    );
  }

  await repo.updateAccount(db, account.id, { commercial_mode: newMode });
  log('info', 'billing-action', 'update_commercial_mode', {
    admin_client_id: params.admin_client_id,
    from: account.commercial_mode,
    to: newMode,
  });
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return { ok: true, commercial_mode: newMode };
}

async function handleSetBillingBlock(db: SupabaseClient, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');
  assert(params.reason, 'reason');
  const reason = assertDomain(params.reason, 'reason', VALID_BLOCK_REASONS);

  const account = await repo.findAccountByClientId(db, params.admin_client_id as string);
  if (!account) throw createHttpError('billing_account not found', 404);

  const patch: Record<string, unknown> = { is_billing_blocked: true, billing_blocked_reason: reason };
  if (reason === 'manual_suspend') patch.lifecycle_status = 'suspended';

  await repo.updateAccount(db, account.id, patch);
  log('info', 'billing-action', 'set_billing_block', {
    admin_client_id: params.admin_client_id,
    reason,
    lifecycle_changed: reason === 'manual_suspend',
  });
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return { ok: true };
}

async function handleClearBillingBlock(db: SupabaseClient, params: Record<string, unknown>) {
  assert(params.admin_client_id, 'admin_client_id');

  const account = await repo.findAccountByClientId(db, params.admin_client_id as string);
  if (!account) throw createHttpError('billing_account not found', 404);

  const patch: Record<string, unknown> = { is_billing_blocked: false, billing_blocked_reason: null };
  // Round 2: retorno simplificado para 'active'.
  // Estado anterior à suspensão não é restaurado — será refinado no Round 3
  // quando billing_account_history permitir salvar o estado anterior no payload.
  if (account.lifecycle_status === 'suspended') patch.lifecycle_status = 'active';

  await repo.updateAccount(db, account.id, patch);
  log('info', 'billing-action', 'clear_billing_block', {
    admin_client_id: params.admin_client_id,
    prev_lifecycle: account.lifecycle_status,
  });
  await syncSummaryOrThrow(db, params.admin_client_id as string);
  return { ok: true };
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
      case 'create_subscription':
        result = await handleCreateSubscription(db, provider, params);
        break;
      case 'change_subscription_plan':
        result = await handleChangeSubscriptionPlan(db, provider, params);
        break;
      case 'cancel_subscription':
        result = await handleCancelSubscription(db, provider, params);
        break;
      case 'suspend_subscription':
        result = await handleSuspendSubscription(db, provider, params);
        break;
      case 'resume_subscription':
        result = await handleResumeSubscription(db, provider, params);
        break;
      case 'create_charge':
        result = await handleCreateCharge(db, provider, params);
        break;
      case 'cancel_charge':
        result = await handleCancelCharge(db, provider, params);
        break;
      case 'prorrogar_charge':
        result = await handleProrrogarCharge(db, provider, params);
        break;
      case 'generate_portal_token':
        result = await handleGeneratePortalToken(db, params);
        break;
      case 'sync_account':
        result = await handleSyncAccount(db, provider, params);
        break;
      case 'clear_planned_plan':
        result = await handleClearPlannedPlan(db, params);
        break;
      case 'update_commercial_mode':
        result = await handleUpdateCommercialMode(db, provider, params);
        break;
      case 'set_billing_block':
        result = await handleSetBillingBlock(db, params);
        break;
      case 'clear_billing_block':
        result = await handleClearBillingBlock(db, params);
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
