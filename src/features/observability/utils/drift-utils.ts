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

export function getSyncableSchemaDrifts(diffs: SchemaDiff[]): SyncableSchemaDrift[] {
  const syncable = new Map<string, SyncableSchemaDrift>();

  for (const diff of diffs) {
    const drift =
      buildViewDrift(diff, diffs) ??
      buildIndexDrift(diff) ??
      buildPolicyDrift(diff);

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
