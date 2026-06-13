// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  BillingAccountLifecycleStatus,
  BillingChargeStatus,
  BillingChargeType,
  BillingInterval,
  BillingSubscriptionStatus,
} from './types.ts';

// ─── Row shapes (mirrors DB schema) ──────────────────────────────────────────

export interface BillingAccountRow {
  id: string;
  admin_client_id: string;
  provider: string;
  provider_customer_id: string | null;
  lifecycle_status: BillingAccountLifecycleStatus;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  current_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingSubscriptionRow {
  id: string;
  billing_account_id: string;
  provider_subscription_id: string | null;
  plan_id: string;
  billing_status: BillingSubscriptionStatus;
  interval: BillingInterval;
  amount: number;
  next_billing_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingChargeRow {
  id: string;
  billing_account_id: string;
  subscription_id: string | null;
  provider_charge_id: string | null;
  type: BillingChargeType;
  status: BillingChargeStatus;
  amount: number;
  due_date: string;
  paid_at: string | null;
  description: string | null;
  payment_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingEventRow {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processed' | 'failed';
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

export interface BillingPortalTokenRow {
  id: string;
  billing_account_id: string;
  charge_id: string | null;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function findAccountByClientId(
  db: SupabaseClient,
  adminClientId: string,
): Promise<BillingAccountRow | null> {
  const { data, error } = await db
    .from('billing_accounts')
    .select('*')
    .eq('admin_client_id', adminClientId)
    .maybeSingle();
  if (error) throw new Error(`billing_accounts lookup failed: ${error.message}`);
  return data;
}

export async function findAccountById(
  db: SupabaseClient,
  id: string,
): Promise<BillingAccountRow | null> {
  const { data, error } = await db
    .from('billing_accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`billing_accounts lookup failed: ${error.message}`);
  return data;
}

export async function insertAccount(
  db: SupabaseClient,
  row: Omit<BillingAccountRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<BillingAccountRow> {
  const { data, error } = await db
    .from('billing_accounts')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`billing_accounts insert failed: ${error.message}`);
  return data;
}

export async function updateAccount(
  db: SupabaseClient,
  id: string,
  patch: Partial<Omit<BillingAccountRow, 'id' | 'admin_client_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await db
    .from('billing_accounts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`billing_accounts update failed: ${error.message}`);
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function insertSubscription(
  db: SupabaseClient,
  row: Omit<BillingSubscriptionRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<BillingSubscriptionRow> {
  const { data, error } = await db
    .from('billing_subscriptions')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`billing_subscriptions insert failed: ${error.message}`);
  return data;
}

export async function updateSubscription(
  db: SupabaseClient,
  id: string,
  patch: Partial<Omit<BillingSubscriptionRow, 'id' | 'billing_account_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await db
    .from('billing_subscriptions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`billing_subscriptions update failed: ${error.message}`);
}

export async function findSubscriptionByProviderId(
  db: SupabaseClient,
  providerSubscriptionId: string,
): Promise<BillingSubscriptionRow | null> {
  const { data, error } = await db
    .from('billing_subscriptions')
    .select('*')
    .eq('provider_subscription_id', providerSubscriptionId)
    .maybeSingle();
  if (error) throw new Error(`billing_subscriptions lookup failed: ${error.message}`);
  return data;
}

// ─── Charges ──────────────────────────────────────────────────────────────────

export async function insertCharge(
  db: SupabaseClient,
  row: Omit<BillingChargeRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<BillingChargeRow> {
  const { data, error } = await db
    .from('billing_charges')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`billing_charges insert failed: ${error.message}`);
  return data;
}

export async function updateCharge(
  db: SupabaseClient,
  id: string,
  patch: Partial<Omit<BillingChargeRow, 'id' | 'billing_account_id' | 'created_at'>>,
): Promise<void> {
  const { error } = await db
    .from('billing_charges')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`billing_charges update failed: ${error.message}`);
}

export async function findChargeByProviderId(
  db: SupabaseClient,
  providerChargeId: string,
): Promise<BillingChargeRow | null> {
  const { data, error } = await db
    .from('billing_charges')
    .select('*')
    .eq('provider_charge_id', providerChargeId)
    .maybeSingle();
  if (error) throw new Error(`billing_charges lookup failed: ${error.message}`);
  return data;
}

// ─── Events ───────────────────────────────────────────────────────────────────

// Inserts event if provider_event_id is new. Returns whether it was inserted.
// Uses insert + conflict detection to avoid silent upsert swallowing the duplicate.
export async function insertEventIfNew(
  db: SupabaseClient,
  row: Omit<BillingEventRow, 'id' | 'processed_at' | 'error' | 'created_at'>,
): Promise<{ inserted: boolean; eventId: string }> {
  const { data, error } = await db
    .from('billing_events')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Duplicate — find the existing id
      const { data: existing } = await db
        .from('billing_events')
        .select('id')
        .eq('provider', row.provider)
        .eq('provider_event_id', row.provider_event_id)
        .single();
      return { inserted: false, eventId: existing?.id ?? '' };
    }
    throw new Error(`billing_events insert failed: ${error.message}`);
  }

  return { inserted: true, eventId: data.id };
}

export async function markEventProcessed(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db
    .from('billing_events')
    .update({ status: 'processed', processed_at: new Date().toISOString(), error: null })
    .eq('id', id);
  if (error) throw new Error(`billing_events mark processed failed: ${error.message}`);
}

export async function markEventFailed(
  db: SupabaseClient,
  id: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await db
    .from('billing_events')
    .update({ status: 'failed', error: errorMessage })
    .eq('id', id);
  if (error) throw new Error(`billing_events mark failed: ${error.message}`);
}

// ─── Portal tokens ────────────────────────────────────────────────────────────

export async function insertPortalToken(
  db: SupabaseClient,
  row: Omit<BillingPortalTokenRow, 'id' | 'used_at' | 'created_at'>,
): Promise<BillingPortalTokenRow> {
  const { data, error } = await db
    .from('billing_portal_tokens')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`billing_portal_tokens insert failed: ${error.message}`);
  return data;
}

export async function findValidToken(
  db: SupabaseClient,
  token: string,
): Promise<BillingPortalTokenRow | null> {
  const { data, error } = await db
    .from('billing_portal_tokens')
    .select('*')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`billing_portal_tokens lookup failed: ${error.message}`);
  return data;
}

export async function consumeToken(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db
    .from('billing_portal_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`billing_portal_tokens consume failed: ${error.message}`);
}
