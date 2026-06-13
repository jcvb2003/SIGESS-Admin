// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { BillingProvider, CreateChargeInput } from './provider.interface.ts';
import type { BillingInterval, BillingWebhookEvent } from './types.ts';
import * as repo from './repositories.ts';

// ─── ProvisionBillingAccount ──────────────────────────────────────────────────

export interface ProvisionBillingAccountInput {
  adminClientId: string;
  planId: string;
  customerInfo: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
  };
}

export async function provisionBillingAccount(
  db: SupabaseClient,
  provider: BillingProvider,
  input: ProvisionBillingAccountInput,
) {
  const existing = await repo.findAccountByClientId(db, input.adminClientId);
  if (existing) throw new Error(`billing_account already exists for client ${input.adminClientId}`);

  const customer = await provider.ensureCustomer({
    ...input.customerInfo,
    externalRef: input.adminClientId,
  });

  return repo.insertAccount(db, {
    admin_client_id: input.adminClientId,
    provider: provider.name,
    provider_customer_id: customer.providerCustomerId,
    lifecycle_status: 'draft',
    trial_starts_at: null,
    trial_ends_at: null,
    current_period_start: null,
    current_period_end: null,
    current_plan_id: input.planId,
  });
}

// ─── StartTrial ───────────────────────────────────────────────────────────────

export interface StartTrialInput {
  adminClientId: string;
  trialDays: number;
}

export async function startTrial(db: SupabaseClient, input: StartTrialInput) {
  const account = await repo.findAccountByClientId(db, input.adminClientId);
  if (!account) throw new Error(`No billing_account for client ${input.adminClientId}`);

  const now = new Date();
  const trialEnd = new Date(now.getTime() + input.trialDays * 86_400_000);

  await repo.updateAccount(db, account.id, {
    lifecycle_status: 'trial_active',
    trial_starts_at: now.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
  });
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

export async function createInitialSubscription(
  db: SupabaseClient,
  provider: BillingProvider,
  input: CreateInitialSubscriptionInput,
) {
  const account = await repo.findAccountByClientId(db, input.adminClientId);
  if (!account) throw new Error(`No billing_account for client ${input.adminClientId}`);
  if (!account.provider_customer_id) throw new Error('Account has no provider_customer_id');

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

  await repo.updateAccount(db, account.id, { lifecycle_status: 'payment_pending' });

  return sub;
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

  // Guard: chargeId, when provided, must belong to this account.
  // Prevents token for account A pointing at a charge from account B.
  if (input.chargeId) {
    const { data: charge, error } = await db
      .from('billing_charges')
      .select('id, billing_account_id')
      .eq('id', input.chargeId)
      .maybeSingle();
    if (error) throw new Error(`billing_charges lookup failed: ${error.message}`);
    if (!charge) throw new Error(`charge ${input.chargeId} not found`);
    if (charge.billing_account_id !== account.id) {
      throw new Error(`charge ${input.chargeId} does not belong to billing_account ${account.id}`);
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
