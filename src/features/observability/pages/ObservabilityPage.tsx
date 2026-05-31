import {
  AlertTriangle,
  Database,
  Globe2,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useObservability } from "../hooks/useObservability";
import { TenantCard } from "../components/TenantCard";
import { ReferenceCard } from "../components/ReferenceCard";
import { ExportStatusCard } from "../components/ExportStatusCard";
import { SchemaDriftCard } from "../components/SchemaDriftCard";
import { buildSchemaSyncActionKey, getSyncableSchemaDrifts, getTenantsWithSameSchemaDrift } from "../utils/drift-utils";
import type { SyncableSchemaDrift } from "../types";

export default function ObservabilityPage() {
  const {
    clients,
    exportRuns,
    schemaStatus,
    snapshots,
    overview,
    isLoadingClients,
    isLoadingExports,
    isLoadingSchema,
    isRefreshing,
    isAuditingSchema,
    isPreparingDrift,
    isApplyingDrift,
    driftPreview,
    driftApplyResults,
    setDriftPreview,
    setDriftApplyResults,
    handleRefresh,
    handleRunSchemaAudit,
    handlePrepareSchemaSync,
    handleApplySchemaSync,
  } = useObservability();

  const batchSyncCandidate = useMemo(() => {
    const candidates = new Map<
      string,
      {
        targets: Array<{ clientId: string; tenantName: string }>;
        operations: SyncableSchemaDrift[];
      }
    >();

    for (const status of schemaStatus) {
      for (const item of getSyncableSchemaDrifts(status.diffs)) {
        const targets = getTenantsWithSameSchemaDrift(schemaStatus, item);
        if (targets.length < 2) continue;

        const groupKey = targets
          .map((target) => target.clientId)
          .sort()
          .join(",");

        const existing = candidates.get(groupKey);
        if (!existing) {
          candidates.set(groupKey, {
            targets,
            operations: [item],
          });
          continue;
        }

        const operationKey = `${item.objectType}:${item.schema}.${item.objectName}:${item.diffType}`;
        const alreadyIncluded = existing.operations.some(
          (operation) =>
            `${operation.objectType}:${operation.schema}.${operation.objectName}:${operation.diffType}` === operationKey,
        );

        if (!alreadyIncluded) {
          existing.operations.push(item);
        }
      }
    }

    return Array.from(candidates.values()).sort((a, b) => {
      if (b.targets.length !== a.targets.length) return b.targets.length - a.targets.length;
      if (b.operations.length !== a.operations.length) return b.operations.length - a.operations.length;
      return a.targets[0]?.tenantName.localeCompare(b.targets[0]?.tenantName ?? "") ?? 0;
    })[0] ?? null;
  }, [schemaStatus]);

  const batchSyncActionKey = useMemo(() => {
    if (!batchSyncCandidate) return null;
    return buildSchemaSyncActionKey(batchSyncCandidate.targets, batchSyncCandidate.operations);
  }, [batchSyncCandidate]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Observabilidade</h1>
            <p className="text-muted-foreground">
              Monitoramento em tempo real da saúde, schema e integridade dos dados de todos os tenants.
            </p>
          </div>
          <Button 
            onClick={handleRefresh} 
            disabled={isRefreshing}
            variant="outline"
            className="w-full lg:w-auto"
          >
            {isRefreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar Visão
          </Button>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-border/40 rounded-xl border border-border/50 sm:grid-cols-4 sm:divide-y-0">
          {[
            { label: "Monitorados", value: overview.total, icon: Globe2, color: "text-primary", bg: "bg-primary/10" },
            { label: "Saudáveis", value: overview.healthy, icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Com problema", value: overview.total - overview.healthy, icon: AlertTriangle, color: overview.total - overview.healthy > 0 ? "text-destructive" : "text-muted-foreground", bg: overview.total - overview.healthy > 0 ? "bg-destructive/10" : "bg-muted/40" },
            { label: "Config pública OK", value: `${overview.publicConfigOk}/${overview.total}`, icon: KeyRound, color: overview.publicConfigOk === overview.total ? "text-sky-500" : "text-amber-500", bg: overview.publicConfigOk === overview.total ? "bg-sky-500/10" : "bg-amber-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="flex items-center gap-3 px-5 py-4">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <div>
                <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-secondary/60">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="exports">Exportação (JSONL)</TabsTrigger>
            <TabsTrigger value="schema">Schema Sync</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {isLoadingClients ? (
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Carregando tenants...</span>
              </div>
            ) : (
              <>
                {(() => {
                  const ref = clients.find(c => c.tenant_code === 'sinpesca-oeiras');
                  return ref ? <ReferenceCard client={ref} /> : null;
                })()}
                <div className="grid gap-4 xl:grid-cols-2">
                  {snapshots
                    .filter(s => s.client.tenant_code !== 'sinpesca-oeiras')
                    .map((snapshot) => (
                      <TenantCard
                        key={snapshot.client.id}
                        snapshot={snapshot}
                        schemaStatus={schemaStatus}
                      />
                    ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="exports" className="space-y-4">
            {isLoadingExports ? (
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Carregando logs de exportação...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {clients.map((client) => (
                  <ExportStatusCard 
                    key={`export-${client.id}`} 
                    client={client} 
                    exportRuns={exportRuns} 
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="schema" className="space-y-4">
            <Card className="border-dashed border-primary/30 bg-primary/5 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Schema Real (Oeiras vs Tenants)</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Compara fisicamente as tabelas, funções, policies, auth e triggers com a referência (Oeiras).
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {batchSyncCandidate ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        handlePrepareSchemaSync(
                          batchSyncCandidate.targets,
                          batchSyncCandidate.operations,
                          {
                            title: `Sync em todos os ${batchSyncCandidate.targets.length} tenants`,
                            description:
                              "Lote com todas as divergências sincronizáveis compartilhadas por este mesmo grupo de tenants. O apply será executado sequencialmente em todos os alvos.",
                          },
                        )
                      }
                      disabled={isPreparingDrift === batchSyncActionKey}
                    >
                      {isPreparingDrift === batchSyncActionKey ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="mr-2 h-4 w-4" />
                      )}
                      Preparar sync em todos ({batchSyncCandidate.targets.length})
                    </Button>
                  ) : null}
                  <Button onClick={handleRunSchemaAudit} disabled={isAuditingSchema}>
                    {isAuditingSchema ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                    Executar Auditoria Profunda
                  </Button>
                </div>
              </div>
            </Card>

            {isLoadingSchema ? (
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Carregando status de schema...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {schemaStatus.map((status) => (
                  <SchemaDriftCard 
                    key={status.tenantId} 
                    status={status} 
                    schemaStatus={schemaStatus}
                    isPreparingDrift={isPreparingDrift}
                    onPrepareSync={handlePrepareSchemaSync}
                  />
                ))}
              </div>
            )}
          </TabsContent>

        </Tabs>

        <Dialog
          open={!!driftPreview}
          onOpenChange={(open) => {
            if (!open) {
              setDriftPreview(null);
              setDriftApplyResults([]);
            }
          }}
        >
          <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>Pré-visualização do sync de schema</DialogTitle>
              <DialogDescription>
                Revise o SQL que será executado em{" "}
                <strong>
                  {(() => {
                    if (!driftPreview) return "";
                    return driftPreview.targets.length === 1
                      ? driftPreview.targets[0].tenantName
                      : `${driftPreview.targets.length} tenants`;
                  })()}
                </strong>{" "}
                para alinhar <code>{driftPreview?.title ?? ""}</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-slate-300">
                {driftPreview?.description ??
                  "O SQL abaixo é derivado do estado real do Oeiras. Para views, as colunas e grants relacionados são alinhados pela mesma operação."}
              </div>
              
              {driftPreview && driftPreview.targets.length > 1 && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                  Este apply será executado sequencialmente para:
                  <div className="mt-2 flex flex-wrap gap-2">
                    {driftPreview.targets.map((target) => (
                      <Badge
                        key={target.clientId}
                        variant="outline"
                        className="border-emerald-300 bg-background/70 text-emerald-800 dark:border-emerald-900 dark:bg-slate-950/40 dark:text-emerald-200"
                      >
                        {target.tenantName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {driftApplyResults.length > 0 && (
                <div className="rounded-md border border-border/60 bg-background/80 p-3">
                  <p className="text-xs font-semibold text-foreground">Resultado do apply</p>
                  <div className="mt-3 space-y-2">
                    {driftApplyResults.map((result) => (
                      <div
                        key={result.clientId}
                        className="flex flex-col gap-2 rounded-md border border-border/50 bg-secondary/10 p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{result.tenantName}</p>
                          {result.error ? (
                            <p className="mt-1 break-all font-mono text-xs text-destructive/90">
                              {result.error}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={result.status === "success" ? "outline" : "destructive"}
                          className={
                            result.status === "success"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"
                              : ""
                          }
                        >
                          {result.status === "success" ? "aplicado" : "falhou"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ScrollArea
                className={`rounded-md border border-border/60 bg-secondary/10 p-3 dark:border-sky-900/40 dark:bg-slate-950/40 ${
                  driftApplyResults.length > 0 ? "h-[220px]" : "h-[420px]"
                }`}
              >
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                  {driftPreview?.sql}
                </pre>
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDriftPreview(null);
                  setDriftApplyResults([]);
                }}
                disabled={isApplyingDrift}
              >
                {driftApplyResults.length > 0 ? "Fechar relatório" : "Fechar"}
              </Button>
              {driftApplyResults.length === 0 ? (
                <Button onClick={handleApplySchemaSync} disabled={isApplyingDrift}>
                  {isApplyingDrift ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="mr-2 h-4 w-4" />
                  )}
                  {driftPreview?.targets.length && driftPreview.targets.length > 1
                    ? `Aplicar em ${driftPreview.targets.length} tenants`
                    : "Aplicar no tenant"}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
