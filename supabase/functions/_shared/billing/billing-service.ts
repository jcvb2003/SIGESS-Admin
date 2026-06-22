// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { BillingProvider, CreateChargeInput } from './provider.interface.ts';
import type { BillingAccountLifecycleStatus, BillingInterval, BillingWebhookEvent } from './types.ts';
import * as repo from './repositories.ts';
import { log } from './logger.ts';

// ─── assertLifecycle ─────────────────────────────────────────────────────────
// Official guard for all billing mutations. Call before any side effect.
// billing-action is the only external entry point — all callers go through here.

export function assertLifecycle(
  account: repo.BillingAccountRow,
  allowed: BillingAccountLifecycleStatus[],
  action: string,
): void {
  if (!allowed.includes(account.lifecycle_status)) {
    const err = Object.assign(
      new Error(`Ação '${action}' não permitida no status '${account.lifecycle_status}'. Permitido: ${allowed.join(', ')}`),
      { status: 409 },
    );
    throw err;
  }
}

// ─── ProvisionBillingAccount ──────────────────────────────────────────────────

export interface ProvisionBillingAccountInput {
  adminClientId: string;
  startAsTrial?: boolean;
  commercialMode?: 'manual' | 'recorrente_mensal' | 'anual';
  customerInfo: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
  };
}

export interface ProvisionBillingAccountResult {
  account: repo.BillingAccountRow;
  created: boolean;
  // true se a conta existe mas ainda está em provisão (provider_customer_id=null).
  // O chamador deve tratar como "tente novamente em breve", não como sucesso.
  pending: boolean;
}

// lifecycle_status = 'provisioning': estado de trânsito durante a provisão.
// Entra: ao ganhar o slot via INSERT.
// Sai: ao persistir provider_customer_id (muda para 'draft').
// Inconsistente: conta em 'provisioning' sem provider_customer_id por > 10 min.
// Nenhuma outra ação (trial, subscription, charge, token) é permitida nesse status.
export async function provisionBillingAccount(
  db: SupabaseClient,
  provider: BillingProvider,
  input: ProvisionBillingAccountInput,
): Promise<ProvisionBillingAccountResult> {
  // 1. Tentar reclamar o slot atomicamente
  const { data: draft, error: insertErr } = await db
    .from('billing_accounts')
    .insert({
      admin_client_id: input.adminClientId,
      provider: provider.name,
      provider_customer_id: null,
      lifecycle_status: 'provisioning',
      commercial_mode: input.commercialMode ?? 'manual',
      trial_starts_at: null,
      trial_ends_at: null,
      current_period_start: null,
      current_period_end: null,
      current_plan_id: null,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const existing = await repo.findAccountByClientId(db, input.adminClientId);
      if (!existing) throw new Error('billing_account disappeared after conflict — investigate immediately');

      // provider_customer_id=null com lifecycle='provisioning' indica que outro request
      // já está criando o cliente no provider — aguardar, não duplicar.
      // Exceção: se o estado 'provisioning' tem mais de 10 minutos, é órfão (crash entre
      // INSERT e persistência do provider_customer_id). Nesse caso prosseguir com ensureCustomer
      // para recuperar — 'provisioning' está em REPROVISION_ALLOWED e será sobrescrito.
      const PROVISIONING_TIMEOUT_MS = 10 * 60 * 1000;
      const isStaleProvisioning =
        existing.lifecycle_status === 'provisioning' &&
        existing.provider_customer_id === null &&
        Date.now() - new Date(existing.updated_at).getTime() > PROVISIONING_TIMEOUT_MS;

      if (existing.provider_customer_id === null && existing.lifecycle_status === 'provisioning' && !isStaleProvisioning) {
        return { account: existing, created: false, pending: true };
      }

      // Re-provisão só permitida em estados internos — não interromper billing ativo.
      const REPROVISION_ALLOWED: BillingAccountLifecycleStatus[] = ['draft', 'trial_active', 'provisioning', 'cancelled'];
      if (!REPROVISION_ALLOWED.includes(existing.lifecycle_status)) {
        const err = Object.assign(
          new Error(`Não é possível re-provisionar conta em status '${existing.lifecycle_status}'. Cancele o billing ativo primeiro.`),
          { status: 409 },
        );
        throw err;
      }

      const customer = await provider.ensureCustomer({
        ...input.customerInfo,
        externalRef: input.adminClientId,
      });

      const providerChanged = provider.name !== existing.provider;
      const customerChanged = customer.providerCustomerId !== existing.provider_customer_id;
      const targetStatus: BillingAccountLifecycleStatus = input.startAsTrial ? 'trial_active' : 'draft';
      const statusChanged = existing.lifecycle_status !== targetStatus;
      const now = new Date().toISOString();

      if (customerChanged || providerChanged || statusChanged) {
        const patch: Record<string, unknown> = { updated_at: now };
        if (customerChanged || providerChanged) {
          patch.provider = provider.name;
          patch.provider_customer_id = customer.providerCustomerId;
        }
        if (statusChanged) {
          patch.lifecycle_status = targetStatus;
          if (input.startAsTrial && !existing.trial_starts_at) {
            patch.trial_starts_at = now;
          }
        }
        await db.from('billing_accounts').update(patch).eq('id', existing.id);
        existing.provider_customer_id = customer.providerCustomerId;
        existing.lifecycle_status = targetStatus;
      }

      return { account: existing, created: false, pending: false };
    }
    throw new Error(`billing_accounts insert failed: ${insertErr.message}`);
  }

  // 2. Slot ganho — criar customer no provider
  let providerCustomerId: string;
  try {
    const customer = await provider.ensureCustomer({
      ...input.customerInfo,
      externalRef: input.adminClientId,
    });
    providerCustomerId = customer.providerCustomerId;
  } catch (providerErr) {
    log('error', 'billing-service', 'ensureCustomer failed — attempting draft cleanup', {
      orphan_account_id: draft.id,
      admin_client_id: input.adminClientId,
      err: String(providerErr),
    });
    const { error: deleteErr } = await db.from('billing_accounts').delete().eq('id', draft.id);
    if (deleteErr) {
      log('error', 'billing-service', 'draft cleanup failed — orphan requires manual reconciliation', {
        orphan_account_id: draft.id,
        admin_client_id: input.adminClientId,
        cleanup_err: deleteErr.message,
      });
    }
    throw providerErr;
  }

  // 3. Persistir provider_customer_id — se falhar, conta fica em 'provisioning' (detectável)
  const finalStatus: BillingAccountLifecycleStatus = input.startAsTrial ? 'trial_active' : 'draft';
  const now = new Date().toISOString();
  const { error: updateErr } = await db
    .from('billing_accounts')
    .update({
      provider_customer_id: providerCustomerId,
      lifecycle_status: finalStatus,
      trial_starts_at: input.startAsTrial ? now : null,
      updated_at: now,
    })
    .eq('id', draft.id);

  if (updateErr) {
    log('error', 'billing-service', 'updateAccount failed after ensureCustomer — partial provision', {
      partial_provision: true,
      account_id: draft.id,
      admin_client_id: input.adminClientId,
      err: updateErr.message,
    });
    throw new Error(`billing_accounts update failed after provider customer created: ${updateErr.message}`);
  }

  const account: repo.BillingAccountRow = { ...draft, provider_customer_id: providerCustomerId, lifecycle_status: finalStatus };
  return { account, created: true, pending: false };
}

// ─── CreateInitialSubscription ────────────────────────────────────────────────

export interface CreateInitialSubscriptionInput {
  adminClientId: string;
  planId: string;
  interval: BillingInterval;
  amount: number;
  nextDueDate: string; // ISO date
  description?: string;
}

export interface ChangeSubscriptionPlanInput extends CreateInitialSubscriptionInput {
  updatePendingPayments?: boolean;
}

export async function createInitialSubscription(
  db: SupabaseClient,
  provider: BillingProvider,
  input: CreateInitialSubscriptionInput,
) {
  const account = await repo.findAccountByClientId(db, input.adminClientId);
  if (!account) throw new Error(`No billing_account for client ${input.adminClientId}`);
  assertLifecycle(account, ['draft', 'trial_active', 'cancelled'], 'create_subscription');

  if (account.commercial_mode === 'manual') {
    const err = Object.assign(
      new Error("Cliente com modo manual não pode ter assinatura recorrente. Use create_charge para cobranças avulsas."),
      { status: 409 },
    );
    throw err;
  }

  if (!account.provider_customer_id) throw new Error('Account has no provider_customer_id');

  const existingSub = await repo.findActiveSubscriptionByAccountId(db, account.id);
  if (existingSub) {
    const err = Object.assign(
      new Error(`billing_account ${account.id} já possui assinatura ativa: ${existingSub.id}. Cancele antes de criar outra.`),
      { status: 409 },
    );
    throw err;
  }

  const providerSub = await provider.createSubscription({
    providerCustomerId: account.provider_customer_id,
    amount: input.amount,
    interval: input.interval,
    nextDueDate: input.nextDueDate,
    description: input.description,
  });

  const sub = await repo.insertSubscription(db, {
    billing_account_id: account.id,
    provider_subscription_id: providerSub.providerSubscriptionId,
    plan_id: input.planId,
    billing_status: providerSub.billingStatus,
    interval: input.interval,
    amount: input.amount,
    next_billing_date: providerSub.nextBillingDate ?? input.nextDueDate,
    starts_at: new Date().toISOString(),
    ends_at: null,
  });

  await repo.updateAccount(db, account.id, {
    lifecycle_status: 'payment_pending',
    current_plan_id: input.planId,
  });

  return sub;
}

export async function changeSubscriptionPlan(
  db: SupabaseClient,
  provider: BillingProvider,
  input: ChangeSubscriptionPlanInput,
) {
  const account = await repo.findAccountByClientId(db, input.adminClientId);
  if (!account) throw new Error(`No billing_account for client ${input.adminClientId}`);
  assertLifecycle(account, ['payment_pending', 'active', 'past_due'], 'change_subscription_plan');
  if (!account.provider_customer_id) throw new Error('Account has no provider_customer_id');

  const existingSub = await repo.findActiveSubscriptionByAccountId(db, account.id);
  if (!existingSub) {
    const err = Object.assign(
      new Error(`billing_account ${account.id} não possui assinatura ativa para trocar de plano.`),
      { status: 409 },
    );
    throw err;
  }
  if (!existingSub.provider_subscription_id) throw new Error('Active subscription has no provider_subscription_id');

  const providerSub = await provider.updateSubscription({
    providerSubscriptionId: existingSub.provider_subscription_id,
    providerCustomerId: account.provider_customer_id,
    amount: input.amount,
    interval: input.interval,
    nextDueDate: input.nextDueDate,
    description: input.description,
    updatePendingPayments: input.updatePendingPayments === true,
  });

  await repo.updateSubscription(db, existingSub.id, {
    plan_id: input.planId,
    billing_status: providerSub.billingStatus,
    interval: input.interval,
    amount: input.amount,
    next_billing_date: providerSub.nextBillingDate ?? input.nextDueDate,
  });

  await repo.updateAccount(db, account.id, {
    current_plan_id: input.planId,
  });
}

// ─── CreateOneOffCharge ───────────────────────────────────────────────────────

export interface CreateOneOffChargeInput {
  adminClientId: string;
  amount: number;
  dueDate: string; // ISO date
  description: string;
  type?: 'one_off' | 'adjustment' | 'tier_upgrade';
  billingType?: CreateChargeInput['billingType'];
}

export async function createOneOffCharge(
  db: SupabaseClient,
  provider: BillingProvider,
  input: CreateOneOffChargeInput,
) {
  const account = await repo.findAccountByClientId(db, input.adminClientId);
  if (!account) throw new Error(`No billing_account for client ${input.adminClientId}`);
  assertLifecycle(account, ['draft', 'trial_active', 'payment_pending', 'active', 'past_due'], 'create_charge');
  if (!account.provider_customer_id) throw new Error('Account has no provider_customer_id');

  const providerCharge = await provider.createCharge({
    providerCustomerId: account.provider_customer_id,
    amount: input.amount,
    dueDate: input.dueDate,
    description: input.description,
    billingType: input.billingType ?? 'BOLETO',
  });

  return repo.insertCharge(db, {
    billing_account_id: account.id,
    subscription_id: null,
    provider_charge_id: providerCharge.providerChargeId,
    type: input.type ?? 'one_off',
    status: providerCharge.status,
    amount: input.amount,
    due_date: input.dueDate,
    paid_at: providerCharge.paidAt ?? null,
    description: input.description,
    payment_url: providerCharge.paymentUrl ?? null,
  });
}

// ─── CancelSubscription ───────────────────────────────────────────────────────

export async function cancelSubscription(
  db: SupabaseClient,
  provider: BillingProvider,
  subscriptionId: string,
) {
  const { data: sub, error } = await db
    .from('billing_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .single();
  if (error || !sub) throw new Error(`billing_subscription ${subscriptionId} not found`);
  if (!sub.provider_subscription_id) throw new Error('Subscription has no provider_subscription_id');

  await provider.cancelSubscription({ providerSubscriptionId: sub.provider_subscription_id });
  await repo.updateSubscription(db, subscriptionId, {
    billing_status: 'cancelled',
    ends_at: new Date().toISOString(),
  });

  // Atualizar lifecycle da conta imediatamente — não aguardar webhook.
  // Garante que guards subsequentes e a projeção reflitam o cancelamento sem depender de reconciliação.
  await repo.updateAccount(db, sub.billing_account_id, { lifecycle_status: 'cancelled' });
}

// ─── RecordWebhookEvent (idempotent) ──────────────────────────────────────────

export async function recordWebhookEvent(
  db: SupabaseClient,
  event: BillingWebhookEvent & { provider: string; payload: Record<string, unknown> },
): Promise<{ alreadyProcessed: boolean; eventId: string }> {
  const { inserted, eventId, existingStatus } = await repo.insertEventIfNew(db, {
    provider: event.provider,
    provider_event_id: event.providerEventId,
    event_type: event.eventType,
    payload: event.payload,
    status: 'pending',
  });

  // Semântica de reapply:
  //   'processed' → não reaplica (idempotência garantida)
  //   'pending'   → reaplica (janela de crash entre insert e apply)
  //   'failed'    → reaplica (apply falhou anteriormente; retry deve tentar novamente)
  return { alreadyProcessed: !inserted && existingStatus === 'processed', eventId };
}

// ─── ApplyWebhookEvent ────────────────────────────────────────────────────────
// Updates local state based on a parsed webhook event.
// Call after recordWebhookEvent confirms the event is new.
// paidAt must come from the provider event — never fabricate it.
export async function applyWebhookEvent(
  db: SupabaseClient,
  eventId: string,
  event: BillingWebhookEvent,
): Promise<void> {
  try {
    if (event.providerChargeId && event.chargeStatus) {
      await _applyChargeStatus(db, event.providerChargeId, event.chargeStatus, event.paidAt);
    }
    if (event.providerSubscriptionId && event.subscriptionStatus) {
      await _applySubscriptionStatus(db, event.providerSubscriptionId, event.subscriptionStatus);
    }
    await repo.markEventProcessed(db, eventId);
  } catch (err) {
    await repo.markEventFailed(db, eventId, String(err));
    throw err;
  }
}

async function _applyChargeStatus(
  db: SupabaseClient,
  providerChargeId: string,
  status: BillingWebhookEvent['chargeStatus'],
  paidAt?: string,
) {
  const charge = await repo.findChargeByProviderId(db, providerChargeId);
  if (!charge) return; // charge not tracked locally — safe to skip

  const patch: Parameters<typeof repo.updateCharge>[2] = { status };
  if (status === 'paid' && paidAt) {
    // Use the provider's actual payment timestamp. Never fabricate or clear an existing value.
    patch.paid_at = paidAt;
  }

  await repo.updateCharge(db, charge.id, patch);

  // Promote account lifecycle status
  if (status === 'paid') {
    await repo.updateAccount(db, charge.billing_account_id, { lifecycle_status: 'active' });
  } else if (status === 'overdue') {
    await repo.updateAccount(db, charge.billing_account_id, { lifecycle_status: 'past_due' });
  }
}

async function _applySubscriptionStatus(
  db: SupabaseClient,
  providerSubscriptionId: string,
  status: BillingWebhookEvent['subscriptionStatus'],
) {
  const sub = await repo.findSubscriptionByProviderId(db, providerSubscriptionId);
  if (!sub) return;

  await repo.updateSubscription(db, sub.id, { billing_status: status });

  if (status === 'cancelled') {
    await repo.updateAccount(db, sub.billing_account_id, { lifecycle_status: 'cancelled' });
  } else if (status === 'overdue') {
    await repo.updateAccount(db, sub.billing_account_id, { lifecycle_status: 'past_due' });
  }
}

// ─── SyncChargeFromProvider ───────────────────────────────────────────────────

export async function syncChargeFromProvider(
  db: SupabaseClient,
  provider: BillingProvider,
  providerChargeId: string,
) {
  const snapshot = await provider.fetchCharge({ providerChargeId });
  const charge = await repo.findChargeByProviderId(db, providerChargeId);
  if (!charge) return;

  const patch: Parameters<typeof repo.updateCharge>[2] = {
    status: snapshot.status,
    payment_url: snapshot.paymentUrl ?? charge.payment_url,
  };
  if (snapshot.paidAt) patch.paid_at = snapshot.paidAt;

  await repo.updateCharge(db, charge.id, patch);

  if (snapshot.status === 'paid') {
    await repo.updateAccount(db, charge.billing_account_id, { lifecycle_status: 'active' });
  } else if (snapshot.status === 'overdue') {
    await repo.updateAccount(db, charge.billing_account_id, { lifecycle_status: 'past_due' });
  }
}

// ─── SyncSubscriptionFromProvider ────────────────────────────────────────────
// Mirrors syncChargeFromProvider: fetches provider state, updates local row,
// propagates lifecycle_status to billing_accounts — same rules as applyWebhookEvent.

export async function syncSubscriptionFromProvider(
  db: SupabaseClient,
  provider: BillingProvider,
  subscriptionId: string,
  providerSubscriptionId: string,
  billingAccountId: string,
) {
  const snapshot = await provider.fetchSubscription({ providerSubscriptionId });

  await repo.updateSubscription(db, subscriptionId, {
    billing_status: snapshot.billingStatus,
    next_billing_date: snapshot.nextBillingDate ?? null,
  });

  if (snapshot.billingStatus === 'cancelled') {
    await repo.updateAccount(db, billingAccountId, { lifecycle_status: 'cancelled' });
  } else if (snapshot.billingStatus === 'overdue') {
    await repo.updateAccount(db, billingAccountId, { lifecycle_status: 'past_due' });
  } else if (snapshot.billingStatus === 'active') {
    await repo.updateAccount(db, billingAccountId, { lifecycle_status: 'active' });
  }
}

// ─── IssuePortalToken ─────────────────────────────────────────────────────────

export interface IssuePortalTokenInput {
  adminClientId: string;
  chargeId?: string;
  expiresInHours?: number;
}

export async function issuePortalToken(
  db: SupabaseClient,
  input: IssuePortalTokenInput,
) {
  const account = await repo.findAccountByClientId(db, input.adminClientId);
  if (!account) throw new Error(`No billing_account for client ${input.adminClientId}`);
  assertLifecycle(account, ['payment_pending', 'active', 'past_due'], 'generate_portal_token');

  // Guard: chargeId, when provided, must belong to this account and be actionable.
  // Prevents token for account A pointing at a charge from account B,
  // and prevents emitting tokens for charges that are already paid/cancelled/failed.
  if (input.chargeId) {
    const { data: charge, error } = await db
      .from('billing_charges')
      .select('id, billing_account_id, status')
      .eq('id', input.chargeId)
      .maybeSingle();
    if (error) throw new Error(`billing_charges lookup failed: ${error.message}`);
    if (!charge) throw new Error(`charge ${input.chargeId} not found`);
    if (charge.billing_account_id !== account.id) {
      throw new Error(`charge ${input.chargeId} does not belong to billing_account ${account.id}`);
    }
    if (!['pending', 'overdue'].includes(charge.status)) {
      const err = Object.assign(
        new Error(`Não é possível gerar token para cobrança com status '${charge.status}'. Apenas cobranças pendentes ou vencidas são aceitas.`),
        { status: 409 },
      );
      throw err;
    }
  }

  const expiresAt = new Date(
    Date.now() + (input.expiresInHours ?? 72) * 3_600_000,
  ).toISOString();

  return repo.insertPortalToken(db, {
    billing_account_id: account.id,
    charge_id: input.chargeId ?? null,
    token: crypto.randomUUID(),
    expires_at: expiresAt,
  });
}

// SyncBillingSummaryToRuntime is intentionally absent from this file.
// Domain (billing-service.ts) must remain blind to infrastructure (Management API, topology).
// Call projection-service.ts directly from edge function handlers.
