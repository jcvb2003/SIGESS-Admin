// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractProjectRef, runManagementQuery } from '../supabase-management.ts';
import { buildBillingSummaryProjection } from './billing-summary.ts';

// ─── SQL value helpers (typed, not generic) ───────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sqlText(v: string | null): string {
  if (v === null) return 'NULL';
  return `'${v.replace(/'/g, "''")}'`;
}

function sqlUuid(v: string | null): string {
  if (v === null) return 'NULL';
  if (!UUID_RE.test(v)) throw new Error(`projection-service: invalid UUID "${v}"`);
  return `'${v}'`;
}

function sqlBool(v: boolean): string {
  return v ? 'true' : 'false';
}

function sqlNumeric(v: number | null): string {
  if (v === null) return 'NULL';
  if (!Number.isFinite(v)) throw new Error(`projection-service: invalid numeric ${v}`);
  return String(v);
}

function sqlDate(v: string | null): string {
  if (v === null) return 'NULL';
  const part = v.split('T')[0];
  if (!DATE_RE.test(part)) throw new Error(`projection-service: invalid date "${v}"`);
  return `'${part}'`;
}

// ─── SQL builders ─────────────────────────────────────────────────────────────

function buildSharedUpsert(
  runtimeTenantId: string,
  p: { subscriptionStatus: string | null; planName: string | null; nextBillingDate: string | null; hasPendingCharge: boolean; pendingChargeAmount: number | null; paymentUrl: string | null; lastSyncedAt: string; isBillingBlocked: boolean; billingBlockedReason: string | null },
): string {
  return `
INSERT INTO public.billing_summary
  (tenant_id, subscription_status, plan_name, next_billing_date,
   has_pending_charge, pending_charge_amount, payment_url,
   last_synced_at, is_billing_blocked, billing_blocked_reason, updated_at)
VALUES (
  ${sqlUuid(runtimeTenantId)},
  ${sqlText(p.subscriptionStatus)},
  ${sqlText(p.planName)},
  ${sqlDate(p.nextBillingDate)},
  ${sqlBool(p.hasPendingCharge)},
  ${sqlNumeric(p.pendingChargeAmount)},
  ${sqlText(p.paymentUrl)},
  ${sqlText(p.lastSyncedAt)},
  ${sqlBool(p.isBillingBlocked)},
  ${sqlText(p.billingBlockedReason)},
  now()
)
ON CONFLICT (tenant_id) WHERE tenant_id IS NOT NULL DO UPDATE SET
  subscription_status    = EXCLUDED.subscription_status,
  plan_name              = EXCLUDED.plan_name,
  next_billing_date      = EXCLUDED.next_billing_date,
  has_pending_charge     = EXCLUDED.has_pending_charge,
  pending_charge_amount  = EXCLUDED.pending_charge_amount,
  payment_url            = EXCLUDED.payment_url,
  last_synced_at         = EXCLUDED.last_synced_at,
  is_billing_blocked     = EXCLUDED.is_billing_blocked,
  billing_blocked_reason = EXCLUDED.billing_blocked_reason,
  updated_at             = now();
`.trim();
}

// UPDATE-then-INSERT (not DELETE+INSERT): safe for isolated topology's single row.
// The INSERT ... WHERE NOT EXISTS only fires if no row exists yet (first projection).
function buildIsolatedUpsert(
  p: { subscriptionStatus: string | null; planName: string | null; nextBillingDate: string | null; hasPendingCharge: boolean; pendingChargeAmount: number | null; paymentUrl: string | null; lastSyncedAt: string; isBillingBlocked: boolean; billingBlockedReason: string | null },
): string {
  const cols = `subscription_status, plan_name, next_billing_date, has_pending_charge, pending_charge_amount, payment_url, last_synced_at, is_billing_blocked, billing_blocked_reason, updated_at`;
  const vals = `${sqlText(p.subscriptionStatus)}, ${sqlText(p.planName)}, ${sqlDate(p.nextBillingDate)}, ${sqlBool(p.hasPendingCharge)}, ${sqlNumeric(p.pendingChargeAmount)}, ${sqlText(p.paymentUrl)}, ${sqlText(p.lastSyncedAt)}, ${sqlBool(p.isBillingBlocked)}, ${sqlText(p.billingBlockedReason)}, now()`;

  return `
UPDATE public.billing_summary
SET
  subscription_status    = ${sqlText(p.subscriptionStatus)},
  plan_name              = ${sqlText(p.planName)},
  next_billing_date      = ${sqlDate(p.nextBillingDate)},
  has_pending_charge     = ${sqlBool(p.hasPendingCharge)},
  pending_charge_amount  = ${sqlNumeric(p.pendingChargeAmount)},
  payment_url            = ${sqlText(p.paymentUrl)},
  last_synced_at         = ${sqlText(p.lastSyncedAt)},
  is_billing_blocked     = ${sqlBool(p.isBillingBlocked)},
  billing_blocked_reason = ${sqlText(p.billingBlockedReason)},
  updated_at             = now()
WHERE tenant_id IS NULL;

INSERT INTO public.billing_summary (tenant_id, ${cols})
SELECT NULL, ${vals}
WHERE NOT EXISTS (SELECT 1 FROM public.billing_summary WHERE tenant_id IS NULL);
`.trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Writes the billing summary projection to the tenant's runtime DB via Management API.
// Must not be called from billing-service.ts — only from edge function handlers
// and billing-sync, which own the infrastructure context.
export async function syncBillingSummaryToRuntime(
  db: SupabaseClient,
  adminClientId: string,
): Promise<void> {
  const snapshot = await buildBillingSummaryProjection(db, adminClientId);
  if (!snapshot) return; // no billing account yet

  // Resolve target project credentials
  const { data: tenant } = await db
    .from('tenants')
    .select('project_id')
    .eq('id', adminClientId)
    .maybeSingle();
  if (!tenant?.project_id) throw new Error(`projection-service: no project_id for tenant ${adminClientId}`);

  const { data: project } = await db
    .from('projetos')
    .select('supabase_url, supabase_access_token, topology')
    .eq('id', tenant.project_id)
    .maybeSingle();
  if (!project) throw new Error(`projection-service: project ${tenant.project_id} not found`);
  if (!project.supabase_access_token) {
    throw new Error(`projection-service: project ${tenant.project_id} has no supabase_access_token`);
  }

  // Topology guard: shared topology requires a runtime_tenant_id to discriminate rows.
  // Projecting NULL into a shared DB would make the row readable by all tenants (RLS bypass).
  if (project.topology.startsWith('shared') && snapshot.runtimeTenantId === null) {
    throw new Error(
      `projection-service: topology "${project.topology}" requires runtime_tenant_id, ` +
      `but tenants.runtime_tenant_id is NULL for client ${adminClientId}. ` +
      `Populate runtime_tenant_id before syncing billing summary.`,
    );
  }

  const projectRef = extractProjectRef(project.supabase_url);

  const sql = snapshot.runtimeTenantId
    ? buildSharedUpsert(snapshot.runtimeTenantId, snapshot)
    : buildIsolatedUpsert(snapshot);

  await runManagementQuery(projectRef, project.supabase_access_token, sql);
}
