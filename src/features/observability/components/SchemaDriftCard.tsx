import { Loader2, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "../utils/format-utils";
import { getSyncableViewDrifts, getTenantsWithSameViewDrift } from "../utils/drift-utils";
import type { TenantSchemaStatus } from "../model/schema-comparator";

interface SchemaDriftCardProps {
  readonly status: TenantSchemaStatus;
  readonly schemaStatus: TenantSchemaStatus[];
  readonly isPreparingDrift: string | null;
  readonly onPrepareSync: (
    targets: Array<{ clientId: string; tenantName: string }>,
    objectName: string,
    schema: string
  ) => void;
}

export function SchemaDriftCard({ 
  status, 
  schemaStatus, 
  isPreparingDrift, 
  onPrepareSync 
}: SchemaDriftCardProps) {
  const syncableDrifts = getSyncableViewDrifts(status.diffs);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{status.tenantName}</h3>
            {status.totalDiffs === 0 ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">100% Sincronizado</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{status.totalDiffs} Divergências</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Última auditoria: {formatDateTime(status.checkedAt)}
          </p>
        </div>
      </div>

      {status.totalDiffs > 0 && (
        <div className="mt-6 border-t border-border/50 pt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {status.summary?.byCategory && Object.entries(status.summary.byCategory).map(([cat, count]) => (
              <Badge key={cat} variant="secondary">
                {cat}: {count}
              </Badge>
            ))}
          </div>

          {syncableDrifts.length > 0 && (
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/70 dark:bg-sky-950/40">
              <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Sync assistido</h4>
              <p className="mt-1 text-xs text-sky-700 dark:text-sky-200/80">
                O Admin pode alinhar views diretamente a partir do estado real do Oeiras.
              </p>

              <div className="mt-3 space-y-2">
                {syncableDrifts.map((item) => {
                  const relatedTargets = getTenantsWithSameViewDrift(
                    schemaStatus,
                    item.schema,
                    item.objectName,
                  );
                  const singleTarget = [
                    { clientId: status.tenantId, tenantName: status.tenantName },
                  ];
                  const singleActionKey = `${singleTarget.map((t) => t.clientId).join(",")}:${item.schema}.${item.objectName}`;
                  const multiActionKey = `${relatedTargets.map((t) => t.clientId).join(",")}:${item.schema}.${item.objectName}`;

                  return (
                    <div
                      key={`${item.schema}.${item.objectName}`}
                      className="flex flex-col gap-3 rounded-md border border-sky-200 bg-background/80 p-3 dark:border-sky-900/60 dark:bg-slate-950/40 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {item.schema}.{item.objectName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          1 operação alinha {item.relatedDiffCount} divergência(s) derivada(s).
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-sky-300 text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/20 dark:text-sky-200 dark:hover:bg-sky-900/40"
                          disabled={isPreparingDrift === singleActionKey || isPreparingDrift === multiActionKey}
                          onClick={() => onPrepareSync(singleTarget, item.objectName, item.schema)}
                        >
                          {isPreparingDrift === singleActionKey ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <Rocket className="mr-2 h-3 w-3" />
                          )}
                          Preparar sync
                        </Button>
                        {relatedTargets.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-emerald-300 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                            disabled={isPreparingDrift === singleActionKey || isPreparingDrift === multiActionKey}
                            onClick={() => onPrepareSync(relatedTargets, item.objectName, item.schema)}
                          >
                            {isPreparingDrift === multiActionKey ? (
                              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            ) : (
                              <Rocket className="mr-2 h-3 w-3" />
                            )}
                            Sync em todos ({relatedTargets.length})
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Detalhes das Divergências</h4>
            <div className="max-h-96 overflow-y-auto rounded-md border border-border/50 bg-secondary/10 p-2">
              {status.diffs.map((diff, idx) => (
                <div key={`${diff.category}-${diff.key}-${idx}`} className="mb-2 rounded border border-border/50 bg-background p-3 text-sm last:mb-0">
                  <div className="flex items-center gap-2 font-medium">
                    <Badge variant="outline" className="uppercase text-xs">{diff.category}</Badge>
                    <span className="text-foreground">{diff.key}</span>
                    <Badge 
                      variant={(() => {
                        if (diff.type === 'missing_in_tenant') return 'destructive';
                        if (diff.type === 'extra_in_tenant') return 'default';
                        return 'secondary';
                      })()}
                      className="ml-auto"
                    >
                      {(() => {
                        if (diff.type === 'missing_in_tenant') return 'Ausente no Tenant';
                        if (diff.type === 'extra_in_tenant') return 'Extra no Tenant';
                        return 'Diferença de Definição';
                      })()}
                    </Badge>
                  </div>
                  {diff.type === 'different_definition' && (
                    <div className="mt-3 grid grid-cols-2 gap-4 rounded-md bg-secondary/20 p-2 font-mono text-xs">
                      <div>
                        <p className="mb-1 font-semibold text-muted-foreground">Oeiras (Ref)</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-emerald-600 dark:text-emerald-400">
                          {typeof diff.oeiras_value === 'object' ? JSON.stringify(diff.oeiras_value, null, 2) : String(diff.oeiras_value)}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 font-semibold text-muted-foreground">Tenant</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-rose-600 dark:text-rose-400">
                          {typeof diff.tenant_value === 'object' ? JSON.stringify(diff.tenant_value, null, 2) : String(diff.tenant_value)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
