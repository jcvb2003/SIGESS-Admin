import { useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProjectSchemaStatus } from "../model/schema-comparator";
import type { SyncableSchemaDrift } from "../types";
import { formatDateTime } from "../utils/format-utils";
import { buildSchemaSyncActionKey, getSyncableSchemaDrifts } from "../utils/drift-utils";

interface SchemaDriftCardProps {
  readonly status: ProjectSchemaStatus;
  readonly schemaStatus: ProjectSchemaStatus[];
  readonly isPreparingDrift: string | null;
  readonly referenceName?: string;
  readonly onPrepareSync: (
    targets: Array<{ projectId: string; projectName: string }>,
    operations:
      | SyncableSchemaDrift[]
      | {
          objectType:
            | "view"
            | "index"
            | "policy"
            | "grant"
            | "auth_config"
            | "function"
            | "function_grant"
            | "trigger";
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
  target: { projectId: string; projectName: string },
  operations: SyncableSchemaDrift[],
) {
  return buildSchemaSyncActionKey([target], operations);
}

function getSyncHelperText(item: SyncableSchemaDrift, ref: string) {
  if (item.objectType === "view") {
    return `1 operação alinha ${item.relatedDiffCount} divergência(s) derivada(s).`;
  }
  if (item.objectType === "function") {
    return `1 operação recria a função com a definição atual de ${ref}.`;
  }
  if (item.objectType === "grant") {
    return `1 operação revoga e reaplica os privilégios conforme ${ref}.`;
  }
  if (item.objectType === "function_grant") {
    return `1 operação revoga e reaplica o EXECUTE da função conforme ${ref}.`;
  }
  if (item.objectType === "auth_config") {
    return `1 operação reaplica o campo canônico do template conforme ${ref}.`;
  }
  if (item.objectType === "trigger") {
    return item.diffType === "extra_in_tenant"
      ? `1 operação remove a trigger extra para alinhar com ${ref}.`
      : `1 operação recria a trigger com a definição atual de ${ref}.`;
  }
  if (item.objectType === "column") {
    return item.diffType === "missing_in_tenant"
      ? `1 operação adiciona a coluna ausente com tipo e default de ${ref}.`
      : `1 operação corrige o DEFAULT da coluna para o valor canônico de ${ref}.`;
  }
  if (item.objectType === "constraint") {
    return item.diffType === "extra_in_tenant"
      ? `1 operação remove a constraint extra para alinhar com ${ref}.`
      : `1 operação recria a constraint com a definição atual de ${ref}.`;
  }
  if (item.objectType === "table") {
    return `1 operação cria a tabela ausente com colunas e PK de ${ref} (sem FK constraints — aplique constraints separadamente).`;
  }
  if (item.objectType === "rls_state") {
    return `1 operação habilita/configura RLS na tabela conforme ${ref}.`;
  }
  if (item.objectType === "extensions") {
    return `1 operação instala a extensão ausente (apenas allowlist aprovada).`;
  }
  if (item.objectType === "enum_type") {
    return item.diffType === "missing_in_tenant"
      ? `1 operação cria o tipo enum com os valores de ${ref}.`
      : `Alteração de enum não é automatizável — avalie manualmente.`;
  }
  if (item.objectType === "edge_functions") {
    return `1 operação aplica o campo verify_jwt conforme ${ref} via Management API.`;
  }
  if (item.diffType === "extra_in_tenant") {
    return `1 operação remove o objeto extra para alinhar com ${ref}.`;
  }
  return `1 operação recria o objeto com a definição de ${ref}.`;
}

function getPreviewDescription(item: SyncableSchemaDrift, ref: string) {
  if (item.objectType === "view") {
    return `O SQL abaixo é derivado do estado real de ${ref} e alinha a view com suas colunas e grants relacionados.`;
  }
  if (item.objectType === "function") {
    return `O SQL abaixo recria a função a partir da definição real de ${ref}.`;
  }
  if (item.objectType === "grant") {
    return `O preview abaixo revoga tudo no tenant e reaplica apenas os privilégios existentes em ${ref}.`;
  }
  if (item.objectType === "function_grant") {
    return `O preview abaixo revoga o EXECUTE atual e reaplica apenas o que existe em ${ref} para essa função.`;
  }
  if (item.objectType === "auth_config") {
    return `O preview abaixo mostra o campo de auth que será sincronizado a partir da configuração canônica de ${ref}.`;
  }
  if (item.objectType === "trigger") {
    return `O SQL abaixo recria a trigger com a definição real de ${ref}.`;
  }
  if (item.objectType === "column") {
    return item.diffType === "missing_in_tenant"
      ? `O SQL abaixo adiciona a coluna com o tipo e default canônicos de ${ref}.`
      : `O SQL abaixo corrige o DEFAULT da coluna para o valor de ${ref}.`;
  }
  if (item.objectType === "constraint") {
    return item.diffType === "extra_in_tenant"
      ? "O SQL abaixo remove a constraint extra no tenant."
      : `O SQL abaixo recria a constraint com a definição real de ${ref}.`;
  }
  if (item.objectType === "table") {
    return `O SQL abaixo cria a tabela com colunas e PK de ${ref}. FK constraints são omitidas e devem ser aplicadas via constraints após criação das tabelas dependentes.`;
  }
  if (item.objectType === "rls_state") {
    return `O SQL abaixo habilita e configura FORCE/NO FORCE de RLS conforme ${ref}.`;
  }
  if (item.objectType === "extensions") {
    return `O SQL abaixo instala a extensão via CREATE EXTENSION IF NOT EXISTS.`;
  }
  if (item.objectType === "enum_type") {
    return item.diffType === "missing_in_tenant"
      ? `O SQL abaixo cria o tipo enum com todos os valores de ${ref}.`
      : `Alteração de enum não é suportada automaticamente — requer DROP + recreate com migração de dados.`;
  }
  if (item.objectType === "edge_functions") {
    return `O preview abaixo mostra a chamada PATCH à Management API para alinhar verify_jwt com ${ref}. Não é SQL.`;
  }
  if (item.diffType === "extra_in_tenant") {
    return `O SQL abaixo remove o objeto extra no tenant para alinhá-lo com ${ref}.`;
  }
  return `O SQL abaixo recria o objeto com a definição atual de ${ref}.`;
}

export function SchemaDriftCard({
  status,
  schemaStatus: _schemaStatus,
  isPreparingDrift,
  referenceName = "referência",
  onPrepareSync,
}: SchemaDriftCardProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const syncableDrifts = getSyncableSchemaDrifts(status.diffs);
  const singleTarget = { projectId: status.projectId, projectName: status.projectName };
  const tenantLevelOperations = syncableDrifts.filter(
    (item) =>
      item.objectType === "index" ||
      item.objectType === "policy" ||
      item.objectType === "grant" ||
      item.objectType === "auth_config" ||
      item.objectType === "function" ||
      item.objectType === "function_grant" ||
      item.objectType === "trigger" ||
      item.objectType === "column" ||
      item.objectType === "constraint" ||
      item.objectType === "table" ||
      item.objectType === "rls_state" ||
      item.objectType === "extensions" ||
      item.objectType === "enum_type",
    // edge_functions: excluded from batch — apply is non-transactional with SQL
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

    if (item.objectType === "function") {
      syncableByDiffIdentity.set(`functions:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "function_grant") {
      syncableByDiffIdentity.set(`function_grants:public.${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "trigger") {
      syncableByDiffIdentity.set(`triggers:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "column") {
      syncableByDiffIdentity.set(`columns:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "constraint") {
      syncableByDiffIdentity.set(`constraints:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "table") {
      syncableByDiffIdentity.set(`tables:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "rls_state") {
      syncableByDiffIdentity.set(`rls_state:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "extensions") {
      syncableByDiffIdentity.set(`extensions:${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "enum_type") {
      syncableByDiffIdentity.set(`enums_and_domains:${item.schema}.${item.objectName}:${item.diffType}`, item);
      continue;
    }

    if (item.objectType === "edge_functions") {
      syncableByDiffIdentity.set(`edge_functions:${item.objectName}:${item.diffType}`, item);
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

  // Group syncable keys by diff category (prefix of the map key)
  const syncableKeysByCategory = new Map<string, string[]>();
  for (const key of syncableByDiffIdentity.keys()) {
    const cat = key.split(":")[0];
    const existing = syncableKeysByCategory.get(cat) ?? [];
    existing.push(key);
    syncableKeysByCategory.set(cat, existing);
  }

  const toggleCategory = (category: string) => {
    const keys = syncableKeysByCategory.get(category) ?? [];
    if (keys.length === 0) return;
    const allSelected = keys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        keys.forEach((k) => next.delete(k));
      } else {
        keys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const toggleItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedOperations = [...syncableByDiffIdentity.entries()]
    .filter(([key]) => selectedKeys.has(key))
    .map(([, item]) => item);

  const selectedActionKey =
    selectedOperations.length > 0 ? buildSingleActionKey(singleTarget, selectedOperations) : null;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{status.projectName}</h3>
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
              Object.entries(status.summary.byCategory).map(([cat, count]) => {
                const keys = syncableKeysByCategory.get(cat) ?? [];
                const syncableCount = keys.length;
                const selectedCount = keys.filter((k) => selectedKeys.has(k)).length;
                const allSelected = syncableCount > 0 && selectedCount === syncableCount;
                const someSelected = selectedCount > 0 && !allSelected;

                return (
                  <Badge
                    key={cat}
                    variant={allSelected ? "default" : "secondary"}
                    className={
                      syncableCount > 0
                        ? "cursor-pointer select-none transition-opacity hover:opacity-80" +
                          (someSelected ? " ring-1 ring-sky-400" : "")
                        : ""
                    }
                    onClick={() => syncableCount > 0 && toggleCategory(cat)}
                    title={
                      syncableCount > 0
                        ? `Clique para ${allSelected ? "desmarcar" : "selecionar"} todos os ${syncableCount} itens sincronizáveis de "${cat}"`
                        : undefined
                    }
                  >
                    {cat}: {count}
                    {syncableCount > 0 && (
                      <span className="ml-1 opacity-70">
                        {selectedCount > 0 ? `(${selectedCount}/${syncableCount})` : `(${syncableCount})`}
                      </span>
                    )}
                  </Badge>
                );
              })}

            <div className="ml-auto flex items-center gap-2">
              {selectedOperations.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                  disabled={isPreparingDrift === selectedActionKey}
                  onClick={() => {
                    // edge_functions must go through the single-item path (non-transactional with SQL)
                    if (selectedOperations.length === 1 && selectedOperations[0].objectType === "edge_functions") {
                      onPrepareSync([singleTarget], selectedOperations[0], {
                        title: selectedOperations[0].displayName,
                        description: getPreviewDescription(selectedOperations[0], referenceName),
                      });
                    } else {
                      onPrepareSync([singleTarget], selectedOperations, {
                        title: `Sync selecionado — ${status.projectName}`,
                        description: `${selectedOperations.length} operação(ões) selecionada(s) manualmente.`,
                      });
                    }
                  }}
                >
                  {isPreparingDrift === selectedActionKey ? (
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <Rocket className="mr-2 h-3 w-3" />
                  )}
                  Aplicar selecionados ({selectedOperations.length})
                </Button>
              )}

              {tenantLevelOperations.length > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-sky-300 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200 dark:hover:bg-sky-900/40"
                  disabled={isPreparingDrift === buildSingleActionKey(singleTarget, tenantLevelOperations)}
                  onClick={() =>
                    onPrepareSync([singleTarget], tenantLevelOperations, {
                      title: `Sync do projeto ${status.projectName}`,
                      description:
                        "Preview agrupado por tipo: functions, triggers, grants e demais objetos em ordem segura de execução.",
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
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Detalhes das Divergências</h4>
            <div className="max-h-96 overflow-y-auto rounded-md border border-border/50 bg-secondary/10 p-2">
              {status.diffs.map((diff, idx) => {
                const mapKey = `${diff.category}:${diff.key}:${diff.type}`;
                const syncableItem = syncableByDiffIdentity.get(mapKey) ?? null;
                const singleActionKey = syncableItem ? buildSingleActionKey(singleTarget, [syncableItem]) : null;
                const isSelected = selectedKeys.has(mapKey);

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
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-sky-600"
                            checked={isSelected}
                            onChange={() => toggleItem(mapKey)}
                          />
                          <p className="text-xs text-sky-800 dark:text-sky-200">
                            {getSyncHelperText(syncableItem, referenceName)}
                          </p>
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-sky-300 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200 dark:hover:bg-sky-900/40"
                          disabled={isPreparingDrift === singleActionKey}
                          onClick={() =>
                            onPrepareSync([singleTarget], syncableItem, {
                              title: syncableItem.displayName,
                              description: getPreviewDescription(syncableItem, referenceName),
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
                          <p className="mb-1 font-semibold text-muted-foreground">{referenceName} (Ref)</p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all text-emerald-600 dark:text-emerald-400">
                            {typeof diff.reference_value === "object"
                              ? JSON.stringify(diff.reference_value, null, 2)
                              : String(diff.reference_value)}
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
