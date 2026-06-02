import type { SchemaDiff } from "../model/schema-comparator";
import type { SyncableSchemaDrift } from "../types";

type SupportedDiffType = "missing_in_tenant" | "extra_in_tenant" | "different_definition";

const SHARED_GOVERNANCE_TABLES = new Set([
  "tenants",
  "tenant_units",
  "tenant_users",
  "user_profiles",
  "user_unit_memberships",
]);

const ISOLATED_ANON_TABLE_GRANT_ALLOWLIST = new Set([
  "foto_upload_tokens",
]);

const ISOLATED_ANON_FUNCTION_GRANT_ALLOWLIST = new Set([
  "confirmar_upload_foto(uuid, text)",
]);

// Columns that are INTENTIONAL ARCHITECTURAL EXTRAS in isolated tenants.
// These were added during Fase F polo-scoping and must NOT be auto-removed.
const INTENTIONAL_EXTRA_COLUMNS = new Set([
  "financeiro_cobrancas_geradas.tenant_id",
  "financeiro_cobrancas_geradas.unit_id",
  "financeiro_config_socio.tenant_id",
  "financeiro_config_socio.unit_id",
  "financeiro_dae.tenant_id",
  "financeiro_dae.unit_id",
  "financeiro_historico_regime.tenant_id",
  "financeiro_historico_regime.unit_id",
  "financeiro_lancamentos.tenant_id",
  "financeiro_lancamentos.unit_id",
  "reap.tenant_id",
  "reap.unit_id",
  "requerimentos.tenant_id",
  "requerimentos.unit_id",
  "tenants.is_active",
  "user_unit_memberships.role",
]);

// Constraints that belong to Phase G (FK repoint to user_profiles) or are
// derived from intentional architectural extras — must NOT be auto-synced.
const PHASE_G_CONSTRAINTS = new Set([
  "tenant_users_user_id_fkey",
  "user_unit_memberships_role_check",
  "user_unit_memberships_tenant_id_user_id_unit_id_key",
  "user_unit_memberships_unit_id_fkey",
]);

// Indexes that are extra in isolated tenants due to architectural extras — must NOT be auto-removed.
const INTENTIONAL_EXTRA_INDEXES = new Set([
  "user_unit_memberships.user_unit_memberships_tenant_id_user_id_unit_id_key",
]);

function looksLikeViewName(name: string) {
  return name.endsWith("_view") || name.startsWith("v_");
}

function isSupportedDiffType(type: string): type is SupportedDiffType {
  return type === "missing_in_tenant" || type === "extra_in_tenant" || type === "different_definition";
}

function pickSource(diff: SchemaDiff) {
  return diff.reference_value ?? diff.tenant_value ?? null;
}

function isAllowedForIsolatedSync(drift: SyncableSchemaDrift) {
  if (drift.objectType === "grant") {
    const lastDotIndex = drift.objectName.lastIndexOf(".");
    if (lastDotIndex <= 0) return true;

    const tableName = drift.objectName.slice(0, lastDotIndex);
    const grantee = drift.objectName.slice(lastDotIndex + 1);

    if (SHARED_GOVERNANCE_TABLES.has(tableName)) {
      return false;
    }

    if (grantee === "anon" && !ISOLATED_ANON_TABLE_GRANT_ALLOWLIST.has(tableName)) {
      return false;
    }

    return true;
  }

  if (drift.objectType === "function_grant") {
    const lastDotIndex = drift.objectName.lastIndexOf(".");
    if (lastDotIndex <= 0) return true;

    const functionSignature = drift.objectName.slice(0, lastDotIndex);
    const grantee = drift.objectName.slice(lastDotIndex + 1);

    if (grantee === "anon" && !ISOLATED_ANON_FUNCTION_GRANT_ALLOWLIST.has(functionSignature)) {
      return false;
    }

    return true;
  }

  return true;
}

function buildViewDrift(diff: SchemaDiff, diffs: SchemaDiff[]): SyncableSchemaDrift | null {
  if (diff.category !== "views" || !isSupportedDiffType(diff.type) || diff.type === "extra_in_tenant") {
    return null;
  }

  const objectName = diff.key;
  const relatedDiffCount = diffs.filter((item) => {
    if (item.category === "views") return item.key === objectName;
    if (item.category === "columns" || item.category === "grants") {
      return item.key.startsWith(`${objectName}.`);
    }
    return false;
  }).length;

  return {
    objectType: "view",
    schema: "public",
    objectName,
    diffType: diff.type,
    displayName: `public.${objectName}`,
    relatedDiffCount,
  };
}

function buildIndexDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "indexes" || !isSupportedDiffType(diff.type)) return null;

  const source = pickSource(diff) as { table?: string; name?: string } | null;
  const tableName = source?.table;
  const indexName = source?.name;
  if (!tableName || !indexName) return null;

  const objectName = `${tableName}.${indexName}`;
  if (INTENTIONAL_EXTRA_INDEXES.has(objectName)) return null;

  return {
    objectType: "index",
    schema: "public",
    objectName,
    diffType: diff.type,
    displayName: `public.${tableName}.${indexName}`,
    relatedDiffCount: 1,
  };
}

function buildPolicyDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "policies" || !isSupportedDiffType(diff.type)) return null;

  const source = pickSource(diff) as { schema?: string; table?: string; name?: string } | null;
  const schema = source?.schema ?? "public";
  const tableName = source?.table;
  const policyName = source?.name;
  if (!tableName || !policyName) return null;

  return {
    objectType: "policy",
    schema,
    objectName: `${tableName}.${policyName}`,
    diffType: diff.type,
    displayName: `${schema}.${tableName}.${policyName}`,
    relatedDiffCount: 1,
  };
}

function buildGrantDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "grants" || !isSupportedDiffType(diff.type)) return null;

  const source = pickSource(diff) as { table?: string; grantee?: string } | null;
  const tableName = source?.table;
  const grantee = source?.grantee;
  if (!tableName || !grantee) return null;

  return {
    objectType: "grant",
    schema: "public",
    objectName: `${tableName}.${grantee}`,
    diffType: diff.type,
    displayName: `public.${tableName}.${grantee}`,
    relatedDiffCount: 1,
  };
}

function buildAuthConfigDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "auth_config" || !isSupportedDiffType(diff.type)) return null;

  return {
    objectType: "auth_config",
    schema: "auth",
    objectName: diff.key,
    diffType: diff.type,
    displayName: `auth.${diff.key}`,
    relatedDiffCount: 1,
  };
}

function buildFunctionDrift(diff: SchemaDiff, diffs: SchemaDiff[]): SyncableSchemaDrift | null {
  if (diff.category !== "functions" || !isSupportedDiffType(diff.type)) return null;

  const source = pickSource(diff) as { name?: string } | null;
  const functionName = source?.name ?? diff.key.split("(")[0];
  const relatedDiffCount = diffs.filter((item) => {
    if (item.category === "function_grants") {
      return item.key.startsWith(`public.${diff.key}.`);
    }

    if (item.category === "triggers") {
      const triggerSource = pickSource(item) as { function_name?: string } | null;
      return triggerSource?.function_name === functionName;
    }

    return false;
  }).length;

  return {
    objectType: "function",
    schema: "public",
    objectName: diff.key,
    diffType: diff.type,
    displayName: `public.${diff.key}`,
    relatedDiffCount: Math.max(1, relatedDiffCount),
  };
}

function buildFunctionGrantDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "function_grants" || !isSupportedDiffType(diff.type)) return null;

  return {
    objectType: "function_grant",
    schema: "public",
    objectName: diff.key.replace(/^public\./, ""),
    diffType: diff.type,
    displayName: diff.key,
    relatedDiffCount: 1,
  };
}

function buildTriggerDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "triggers" || !isSupportedDiffType(diff.type)) return null;

  return {
    objectType: "trigger",
    schema: "public",
    objectName: diff.key,
    diffType: diff.type,
    displayName: `public.${diff.key}`,
    relatedDiffCount: 1,
  };
}

function buildColumnDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "columns" || !isSupportedDiffType(diff.type)) return null;
  // Never auto-drop columns — too destructive
  if (diff.type === "extra_in_tenant") return null;
  // Skip intentional architectural extras
  if (INTENTIONAL_EXTRA_COLUMNS.has(diff.key)) return null;

  const source = pickSource(diff) as { table?: string; column?: string } | null;
  const tableName = source?.table;
  const columnName = source?.column;
  if (!tableName || !columnName) return null;
  if (looksLikeViewName(tableName)) return null;

  return {
    objectType: "column",
    schema: "public",
    objectName: diff.key,
    diffType: diff.type,
    displayName: `public.${tableName}.${columnName}`,
    relatedDiffCount: 1,
  };
}

function buildConstraintDrift(diff: SchemaDiff): SyncableSchemaDrift | null {
  if (diff.category !== "constraints" || !isSupportedDiffType(diff.type)) return null;

  const source = pickSource(diff) as { table?: string; name?: string } | null;
  const tableName = source?.table;
  const constraintName = source?.name;
  if (!tableName || !constraintName) return null;

  // Phase G / architectural extras — never sync
  if (PHASE_G_CONSTRAINTS.has(constraintName)) return null;

  // Never auto-drop extra constraints derived from intentional columns
  if (diff.type === "extra_in_tenant") {
    const isFromExtraColumn = constraintName.includes("_tenant_id_") || constraintName.includes("_unit_id_");
    if (isFromExtraColumn) return null;
  }

  return {
    objectType: "constraint",
    schema: "public",
    objectName: `${tableName}.${constraintName}`,
    diffType: diff.type,
    displayName: `public.${tableName}.${constraintName}`,
    relatedDiffCount: 1,
  };
}

export function getSyncableSchemaDrifts(diffs: SchemaDiff[]): SyncableSchemaDrift[] {
  const syncable = new Map<string, SyncableSchemaDrift>();

  for (const diff of diffs) {
    const drift =
      buildViewDrift(diff, diffs) ??
      buildIndexDrift(diff) ??
      buildPolicyDrift(diff) ??
      buildGrantDrift(diff) ??
      buildAuthConfigDrift(diff) ??
      buildFunctionDrift(diff, diffs) ??
      buildFunctionGrantDrift(diff) ??
      buildTriggerDrift(diff) ??
      buildColumnDrift(diff) ??
      buildConstraintDrift(diff);

    if (!drift) continue;
    if (!isAllowedForIsolatedSync(drift)) continue;
    syncable.set(`${drift.objectType}:${drift.schema}:${drift.objectName}:${drift.diffType}`, drift);
  }

  return Array.from(syncable.values());
}

export function buildSchemaSyncActionKey(
  targets: Array<{ projectId: string; projectName: string }>,
  operations: Array<Pick<SyncableSchemaDrift, "objectType" | "schema" | "objectName" | "diffType">>,
) {
  const normalizedTargets = [...targets].map((target) => target.projectId).sort().join(",");
  const normalizedOperations = [...operations]
    .map((operation) => `${operation.objectType}:${operation.schema}.${operation.objectName}:${operation.diffType}`)
    .sort()
    .join("|");

  return `${normalizedTargets}:${normalizedOperations}`;
}
