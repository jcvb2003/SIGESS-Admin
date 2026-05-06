import type { SchemaDiff, TenantSchemaStatus } from "../model/schema-comparator";
import type { SyncableViewDrift } from "../types";

export function getSyncableViewDrifts(diffs: SchemaDiff[]): SyncableViewDrift[] {
  const syncable = new Map<string, SyncableViewDrift>();

  for (const diff of diffs) {
    if (diff.category !== "views") continue;
    if (diff.type !== "missing_in_tenant" && diff.type !== "different_definition") continue;

    const objectName = diff.key;
    const relatedDiffCount = diffs.filter((item) => {
      if (item.category === "views") return item.key === objectName;
      if (item.category === "columns" || item.category === "grants") {
        return item.key.startsWith(`${objectName}.`);
      }
      return false;
    }).length;

    syncable.set(objectName, {
      schema: "public",
      objectName,
      relatedDiffCount,
    });
  }

  return Array.from(syncable.values());
}

export function getTenantsWithSameViewDrift(
  allStatus: TenantSchemaStatus[],
  schema: string,
  objectName: string,
) {
  return allStatus
    .filter((status) =>
      getSyncableViewDrifts(status.diffs).some(
        (item) => item.schema === schema && item.objectName === objectName,
      ),
    )
    .map((status) => ({
      clientId: status.tenantId,
      tenantName: status.tenantName,
    }));
}
