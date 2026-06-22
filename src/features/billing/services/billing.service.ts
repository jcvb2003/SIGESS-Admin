import { supabase } from '@/lib/supabase';
import type { BillingAccount, BillingCharge, BillingPlan, BillingSubscription } from '../types';

// ─── Reads (direct Admin DB) ──────────────────────────────────────────────────

export async function getBillingAccount(adminClientId: string): Promise<BillingAccount | null> {
  const { data, error } = await supabase
    .from('billing_accounts')
    .select('*')
    .eq('admin_client_id', adminClientId)
    .maybeSingle();
  if (error) throw new Error(`billing_accounts lookup failed: ${error.message}`);
  return data as BillingAccount | null;
}

export async function getActiveSubscription(billingAccountId: string): Promise<BillingSubscription | null> {
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('billing_account_id', billingAccountId)
    .in('billing_status', ['active', 'trialing', 'pending_payment', 'overdue'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`billing_subscriptions lookup failed: ${error.message}`);
  return data as BillingSubscription | null;
}

export async function getBillingCharges(billingAccountId: string): Promise<BillingCharge[]> {
  // Recorte operacional do Marco 3 — não é histórico completo
  const { data, error } = await supabase
    .from('billing_charges')
    .select('*')
    .eq('billing_account_id', billingAccountId)
    .order('due_date', { ascending: false })
    .limit(20);
  if (error) throw new Error(`billing_charges lookup failed: ${error.message}`);
  return (data ?? []) as BillingCharge[];
}

export async function getBillingPlans(): Promise<BillingPlan[]> {
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .eq('active', true)
    .order('max_socios_to', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`billing_plans lookup failed: ${error.message}`);
  return (data ?? []) as BillingPlan[];
}

export async function getAllBillingPlans(): Promise<BillingPlan[]> {
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .order('max_socios_to', { ascending: true, nullsFirst: false });
  if (error) throw new Error(`billing_plans lookup failed: ${error.message}`);
  return (data ?? []) as BillingPlan[];
}

export interface BillingPlanInput {
  name: string;
  max_socios_to: number | null;
  price_monthly: number;
  price_annual: number;
  effective_from: string;
  active: boolean;
}

export async function createBillingPlan(input: BillingPlanInput): Promise<BillingPlan> {
  const { data, error } = await supabase
    .from('billing_plans')
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(`billing_plans insert failed: ${error.message}`);
  return data as BillingPlan;
}

export async function updateBillingPlan(id: string, input: Partial<BillingPlanInput>): Promise<void> {
  const { error } = await supabase
    .from('billing_plans')
    .update(input)
    .eq('id', id);
  if (error) throw new Error(`billing_plans update failed: ${error.message}`);
}

export async function deleteBillingPlan(id: string): Promise<void> {
  const { error } = await supabase
    .from('billing_plans')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`billing_plans delete failed: ${error.message}`);
}

export interface ProviderSettings {
  provider: string;
  sandbox: boolean;
  api_key_configured: boolean;
}

// ─── Global dashboard queries ──────────────────────────────────────────────

export interface BillingAccountSummary {
  id: string;
  admin_client_id: string;
  nome_entidade: string;
  tenant_code: string;
  commercial_mode: 'manual' | 'recorrente_mensal' | 'anual';
  lifecycle_status: BillingAccountLifecycleStatus;
  is_billing_blocked: boolean;
  billing_blocked_reason: string | null;
  provider: string;
}

export async function getAllBillingAccountsSummary(): Promise<BillingAccountSummary[]> {
  const { data, error } = await supabase
    .from('billing_accounts')
    .select(`id, admin_client_id, commercial_mode, lifecycle_status,
             is_billing_blocked, billing_blocked_reason, provider,
             tenants!inner(nome_entidade, tenant_code)`)
    .order('lifecycle_status', { ascending: true });
  if (error) throw new Error(`billing_accounts summary failed: ${error.message}`);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    admin_client_id: row.admin_client_id,
    nome_entidade: row.tenants.nome_entidade,
    tenant_code: row.tenants.tenant_code,
    commercial_mode: row.commercial_mode,
    lifecycle_status: row.lifecycle_status,
    is_billing_blocked: row.is_billing_blocked,
    billing_blocked_reason: row.billing_blocked_reason,
    provider: row.provider,
  }));
}

export interface UpcomingCharge {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  type: string;
  nome_entidade: string;
  admin_client_id: string;
  lifecycle_status: string;
}

export async function getOpenChargesSummary(): Promise<UpcomingCharge[]> {
  const { data, error } = await supabase
    .from('billing_charges')
    .select(`id, amount, due_date, status, type,
             billing_accounts!inner(admin_client_id, lifecycle_status,
               tenants!inner(nome_entidade))`)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(30);
  if (error) throw new Error(`open charges summary failed: ${error.message}`);
  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    amount: row.amount,
    due_date: row.due_date,
    status: row.status,
    type: row.type,
    nome_entidade: row.billing_accounts.tenants.nome_entidade,
    admin_client_id: row.billing_accounts.admin_client_id,
    lifecycle_status: row.billing_accounts.lifecycle_status,
  }));
}

export interface BillingEvent {
  id: string;
  provider: string;
  event_type: string;
  status: 'pending' | 'processed' | 'failed';
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

export async function getBillingEvents(limit = 50): Promise<BillingEvent[]> {
  const { data, error } = await supabase
    .from('billing_events')
    .select('id, provider, event_type, status, error, created_at, processed_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`billing_events fetch failed: ${error.message}`);
  return (data ?? []) as BillingEvent[];
}

export async function invokeSyncAll(): Promise<{ synced: number; total: number; results: { accountId: string; ok: boolean; error?: string }[] }> {
  const { data, error } = await supabase.functions.invoke('billing-sync', {
    body: { action: 'sync_all' },
  });
  if (error) throw new Error(`billing-sync failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getAllBillingCharges(billingAccountId: string): Promise<BillingCharge[]> {
  const { data, error } = await supabase
    .from('billing_charges')
    .select('*')
    .eq('billing_account_id', billingAccountId)
    .order('due_date', { ascending: false });
  if (error) throw new Error(`billing_charges lookup failed: ${error.message}`);
  return (data ?? []) as BillingCharge[];
}

export async function getProviderSettings(): Promise<ProviderSettings | null> {
  const { data, error } = await supabase
    .from('billing_provider_settings')
    .select('provider, sandbox, api_key')
    .eq('id', 'default')
    .maybeSingle();
  if (error) throw new Error(`provider_settings lookup failed: ${error.message}`);
  if (!data) return null;
  return {
    provider: data.provider,
    sandbox: data.sandbox,
    api_key_configured: Boolean(data.api_key),
  };
}

// ─── Writes (via billing-action edge function) ────────────────────────────────

export async function invokeBillingAction(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('billing-action', {
    body: { action, params },
  });

  if (error) {
    const ctx = (error as any).context as unknown;
    if (ctx) {
      try {
        if (ctx instanceof Response) {
          const body = await ctx.clone().json();
          if (body?.error) throw new Error(body.error);
        }

        if (typeof ctx === 'object' && ctx !== null && 'error' in ctx) {
          const body = ctx as { error?: unknown };
          if (typeof body.error === 'string' && body.error.trim()) {
            throw new Error(body.error);
          }
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== 'body used already') throw parseErr;
      }
    }
    throw error;
  }

  if (data?.error) throw new Error(data.error);
  return data;
}
