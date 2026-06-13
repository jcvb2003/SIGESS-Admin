// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { BillingSubscriptionStatus } from './types.ts';
import * as repo from './repositories.ts';

export interface BillingSummaryProjection {
  runtimeTenantId: string | null;         // NULL = isolated topology (tenant_id IS NULL in billing_summary)
  subscriptionStatus: BillingSubscriptionStatus | null;
  planName: string | null;
  nextBillingDate: string | null;          // 'YYYY-MM-DD'
  hasPendingCharge: boolean;
  pendingChargeAmount: number | null;      // reais
  paymentUrl: string | null;
  lastSyncedAt: string;                    // ISO datetime
}

// Builds a point-in-time snapshot of billing state from the Admin DB.
// Has zero knowledge of Management API, project URLs, or topology routing —
// that responsibility belongs to projection-service.ts.
export async function buildBillingSummaryProjection(
  db: SupabaseClient,
  adminClientId: string,
): Promise<BillingSummaryProjection | null> {
  const account = await repo.findAccountByClientId(db, adminClientId);
  if (!account) return null;

  // runtime_tenant_id: NULL for isolated topologies (1 DB = 1 tenant)
  const { data: tenant } = await db
    .from('tenants')
    .select('runtime_tenant_id')
    .eq('id', adminClientId)
    .maybeSingle();

  // Most recent active subscription for status + next billing date
  const sub = await repo.findActiveSubscriptionByAccountId(db, account.id);

  // Most urgent open charge (lowest due_date) for payment link + pending amount
  const { data: urgentCharge } = await db
    .from('billing_charges')
    .select('amount, payment_url')
    .eq('billing_account_id', account.id)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Plan display name
  let planName: string | null = null;
  if (account.current_plan_id) {
    const { data: plan } = await db
      .from('billing_plans')
      .select('name')
      .eq('id', account.current_plan_id)
      .maybeSingle();
    planName = plan?.name ?? null;
  }

  return {
    runtimeTenantId: tenant?.runtime_tenant_id ?? null,
    subscriptionStatus: sub?.billing_status ?? null,
    planName,
    nextBillingDate: sub?.next_billing_date ?? null,
    hasPendingCharge: urgentCharge !== null,
    pendingChargeAmount: urgentCharge?.amount ?? null,
    paymentUrl: urgentCharge?.payment_url ?? null,
    lastSyncedAt: new Date().toISOString(),
  };
}
