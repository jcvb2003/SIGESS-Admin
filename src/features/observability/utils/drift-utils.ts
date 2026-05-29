import type { SchemaDiff, TenantSchemaStatus } from "../model/schema-comparator";
import type { SyncableSchemaDrift } from "../types";

type SupportedDiffType = "missing_in_tenant" | "extra_in_tenant" | "different_definition";

function isSupportedDiffType(type: string): type is SupportedDiffType {
  return type === "missing_in_tenant" || type === "extra_in_tenant" || type === "different_definition";
}

function pickSource(diff: SchemaDiff) {
  return diff.oeiras_value ?? diff.tenant_value ?? null;
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

  return {
    objectType: "index",
    schema: "public",
    objectName: `${tableName}.${indexName}`,
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
      buildTriggerDrift(diff);

    if (!drift) continue;
    syncable.set(`${drift.objectType}:${drift.schema}:${drift.objectName}:${drift.diffType}`, drift);
  }

  return Array.from(syncable.values());
}

export function getTenantsWithSameSchemaDrift(
  allStatus: TenantSchemaStatus[],
  target: Pick<SyncableSchemaDrift, "objectType" | "schema" | "objectName" | "diffType">,
) {
  return allStatus
    .filter((status) =>
      getSyncableSchemaDrifts(status.diffs).some(
        (item) =>
          item.objectType === target.objectType &&
          item.schema === target.schema &&
          item.objectName === target.objectName &&
          item.diffType === target.diffType,
      ),
    )
    .map((status) => ({
      clientId: status.tenantId,
      tenantName: status.tenantName,
    }));
}

export function buildSchemaSyncActionKey(
  targets: Array<{ clientId: string; tenantName: string }>,
  operations: Array<Pick<SyncableSchemaDrift, "objectType" | "schema" | "objectName" | "diffType">>,
) {
  const normalizedTargets = [...targets].map((target) => target.clientId).sort().join(",");
  const normalizedOperations = [...operations]
    .map((operation) => `${operation.objectType}:${operation.schema}.${operation.objectName}:${operation.diffType}`)
    .sort()
    .join("|");

  return `${normalizedTargets}:${normalizedOperations}`;
}
