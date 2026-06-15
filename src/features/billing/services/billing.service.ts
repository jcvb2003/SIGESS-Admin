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
    .order('max_socios_from', { ascending: true });
  if (error) throw new Error(`billing_plans lookup failed: ${error.message}`);
  return (data ?? []) as BillingPlan[];
}

export async function getAllBillingPlans(): Promise<BillingPlan[]> {
  const { data, error } = await supabase
    .from('billing_plans')
    .select('*')
    .order('max_socios_from', { ascending: true });
  if (error) throw new Error(`billing_plans lookup failed: ${error.message}`);
  return (data ?? []) as BillingPlan[];
}

export interface BillingPlanInput {
  name: string;
  max_socios_from: number;
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
