import { Loader2, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TenantSchemaStatus } from "../model/schema-comparator";
import type { SyncableSchemaDrift } from "../types";
import { formatDateTime } from "../utils/format-utils";
import { getSyncableSchemaDrifts } from "../utils/drift-utils";

interface SchemaDriftCardProps {
  readonly status: TenantSchemaStatus;
  readonly schemaStatus: TenantSchemaStatus[];
  readonly isPreparingDrift: string | null;
  readonly onPrepareSync: (
    targets: Array<{ clientId: string; tenantName: string }>,
    operations:
      | SyncableSchemaDrift[]
      | {
          objectType: "view" | "index" | "policy" | "grant" | "auth_config";
          objectName: string;
          schema: string;
          diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition";
          displayName?: string;
          relatedDiffCount?: number;
        },
    previewMeta?: { title?: string; description?: string },
  ) => void;
}

function buildSingleActionKey(
  target: { clientId: string; tenantName: string },
  operations: SyncableSchemaDrift[],
) {
  return `${target.clientId}:${operations
    .map((op) => `${op.objectType}:${op.schema}.${op.objectName}:${op.diffType}`)
    .join("|")}`;
}

function getSyncHelperText(item: SyncableSchemaDrift) {
  if (item.objectType === "view") {
    return `1 operação alinha ${item.relatedDiffCount} divergência(s) derivada(s).`;
  }
  if (item.objectType === "grant") {
    return "1 operação revoga e reaplica os privilégios conforme Oeiras.";
  }
  if (item.objectType === "auth_config") {
    return "1 operação reaplica o campo canônico do template conforme Oeiras.";
  }
  if (item.diffType === "extra_in_tenant") {
    return "1 operação remove o objeto extra para alinhar com Oeiras.";
  }
  return "1 operação recria o objeto com a definição de Oeiras.";
}

function getPreviewDescription(item: SyncableSchemaDrift) {
  if (item.objectType === "view") {
    return "O SQL abaixo é derivado do estado real do Oeiras e alinha a view com suas colunas e grants relacionados.";
  }
  if (item.objectType === "grant") {
    return "O preview abaixo revoga tudo no tenant e reaplica apenas os privilégios existentes em Oeiras.";
  }
  if (item.objectType === "auth_config") {
    return "O preview abaixo mostra o campo de auth que será sincronizado a partir da configuração canônica do Oeiras.";
  }
  if (item.diffType === "extra_in_tenant") {
    return "O SQL abaixo remove o objeto extra no tenant para alinhá-lo com o Oeiras.";
  }
  return "O SQL abaixo recria o objeto com a definição atual do Oeiras.";
}

export function SchemaDriftCard({
  status,
  schemaStatus: _schemaStatus,
  isPreparingDrift,
  onPrepareSync,
}: SchemaDriftCardProps) {
  const syncableDrifts = getSyncableSchemaDrifts(status.diffs);
  const singleTarget = { clientId: status.tenantId, tenantName: status.tenantName };
  const tenantLevelOperations = syncableDrifts.filter(
    (item) =>
      item.objectType === "index" ||
      item.objectType === "policy" ||
      item.objectType === "grant" ||
      item.objectType === "auth_config",
  );

  const syncableByDiffIdentity = new Map<string, SyncableSchemaDrift>();
  for (const item of syncableDrifts) {
    if (item.objectType === "view") {
      syncableByDiffIdentity.set(`views:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "auth_config") {
      syncableByDiffIdentity.set(`auth_config:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    const [tableName, objectName] = item.objectName.split(".", 2);
    if (!tableName || !objectName) continue;

    if (item.objectType === "grant") {
      syncableByDiffIdentity.set(`grants:${tableName}.${objectName}:${item.diffType}`, item);
      continue;
    }

    const category = item.objectType === "index" ? "indexes" : "policies";
    syncableByDiffIdentity.set(`${category}:${tableName}.${objectName}:${item.diffType}`, item);
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{status.tenantName}</h3>
            {status.totalDiffs === 0 ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                100% Sincronizado
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                {status.totalDiffs} Divergências
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Última auditoria: {formatDateTime(status.checkedAt)}</p>
        </div>
      </div>

      {status.totalDiffs > 0 && (
        <div className="mt-6 border-t border-border/50 pt-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {status.summary?.byCategory &&
              Object.entries(status.summary.byCategory).map(([cat, count]) => (
                <Badge key={cat} variant="secondary">
                  {cat}: {count}
                </Badge>
              ))}

            {tenantLevelOperations.length > 1 ? (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto border-sky-300 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200 dark:hover:bg-sky-900/40"
                disabled={isPreparingDrift === buildSingleActionKey(singleTarget, tenantLevelOperations)}
                onClick={() =>
                  onPrepareSync([singleTarget], tenantLevelOperations, {
                    title: `Sync do tenant ${status.tenantName}`,
                    description:
                      "Preview agrupado por tipo: indexes, policies, grants e auth_config em ordem segura de execução.",
                  })
                }
              >
                {isPreparingDrift === buildSingleActionKey(singleTarget, tenantLevelOperations) ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <Rocket className="mr-2 h-3 w-3" />
                )}
                Preparar sync do tenant ({tenantLevelOperations.length})
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Detalhes das Divergências</h4>
            <div className="max-h-96 overflow-y-auto rounded-md border border-border/50 bg-secondary/10 p-2">
              {status.diffs.map((diff, idx) => {
                const syncableItem =
                  syncableByDiffIdentity.get(`${diff.category}:${diff.key}:${diff.type}`) ?? null;
                const singleActionKey = syncableItem ? buildSingleActionKey(singleTarget, [syncableItem]) : null;

                return (
                  <div
                    key={`${diff.category}-${diff.key}-${idx}`}
                    className="mb-2 rounded border border-border/50 bg-background p-3 text-sm last:mb-0"
                  >
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <Badge variant="outline" className="uppercase text-xs">
                        {diff.category}
                      </Badge>
                      <span className="text-foreground">{diff.key}</span>
                      <Badge
                        variant={(() => {
                          if (diff.type === "missing_in_tenant") return "destructive";
                          if (diff.type === "extra_in_tenant") return "default";
                          return "secondary";
                        })()}
                        className="ml-auto"
                      >
                        {(() => {
                          if (diff.type === "missing_in_tenant") return "Ausente no Tenant";
                          if (diff.type === "extra_in_tenant") return "Extra no Tenant";
                          return "Diferença de Definição";
                        })()}
                      </Badge>
                    </div>

                    {syncableItem ? (
                      <div className="mt-3 flex flex-col gap-2 rounded-md border border-sky-200/70 bg-sky-50/60 p-3 dark:border-sky-900/50 dark:bg-sky-950/20 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-sky-800 dark:text-sky-200">{getSyncHelperText(syncableItem)}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-sky-300 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200 dark:hover:bg-sky-900/40"
                          disabled={isPreparingDrift === singleActionKey}
                          onClick={() =>
                            onPrepareSync([singleTarget], syncableItem, {
                              title: syncableItem.displayName,
                              description: getPreviewDescription(syncableItem),
                            })
                          }
                        >
                          {isPreparingDrift === singleActionKey ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Rocket className="mr-2 h-3 w-3" />
                          )}
                          Preparar sync
                        </Button>
                      </div>
                    ) : null}

                    {diff.type === "different_definition" && (
                      <div className="mt-3 grid grid-cols-2 gap-4 rounded-md bg-secondary/20 p-2 font-mono text-xs">
                        <div>
                          <p className="mb-1 font-semibold text-muted-foreground">Oeiras (Ref)</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-emerald-600 dark:text-emerald-400">
                            {typeof diff.oeiras_value === "object"
                              ? JSON.stringify(diff.oeiras_value, null, 2)
                              : String(diff.oeiras_value)}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 font-semibold text-muted-foreground">Tenant</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-rose-600 dark:text-rose-400">
                            {typeof diff.tenant_value === "object"
                              ? JSON.stringify(diff.tenant_value, null, 2)
                              : String(diff.tenant_value)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
