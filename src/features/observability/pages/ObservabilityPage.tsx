import { 
  CheckCircle2, 
  Database, 
  Globe2, 
  Loader2, 
  RefreshCw, 
  Rocket, 
  ServerCrash 
} from "lucide-react";
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
import { ExportStatusCard } from "../components/ExportStatusCard";
import { SchemaDriftCard } from "../components/SchemaDriftCard";
import { ImportHistoryCard } from "../components/ImportHistoryCard";

export default function ObservabilityPage() {
  const {
    clients,
    allImports,
    exportRuns,
    schemaStatus,
    snapshots,
    overview,
    isLoadingClients,
    isLoadingImports,
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="group relative overflow-hidden border-border/40 bg-secondary/10 p-5 shadow-sm transition-all hover:border-border/80 hover:shadow-md">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Auditando</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                  {isLoadingSchema ? "..." : schemaStatus.length}
                </p>
              </div>
              <div className="rounded-full bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary/20">
                <Database className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="group relative overflow-hidden border-border/40 bg-secondary/10 p-5 shadow-sm transition-all hover:border-border/80 hover:shadow-md">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/5 transition-transform group-hover:scale-150" />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Tenants monitorados</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{overview.total}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary/20">
                <Globe2 className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="group relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-5 shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-md">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-500/5 transition-transform group-hover:scale-150" />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Saudáveis</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">{overview.healthy}</p>
              </div>
              <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 transition-colors group-hover:bg-emerald-500/20 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </Card>

          <Card className="group relative overflow-hidden border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-transparent p-5 shadow-sm transition-all hover:border-rose-500/40 hover:shadow-md">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-rose-500/5 transition-transform group-hover:scale-150" />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Importações críticas</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-rose-700 dark:text-rose-300">{overview.failedImports}</p>
                <p className="mt-1 text-xs font-medium text-rose-600/80 dark:text-rose-400/80">
                  {overview.processingImports} em fila/processando
                </p>
              </div>
              <div className="rounded-full bg-rose-500/10 p-2 text-rose-600 transition-colors group-hover:bg-rose-500/20 dark:text-rose-400">
                <ServerCrash className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-secondary/60">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="exports">Exportação (JSONL)</TabsTrigger>
            <TabsTrigger value="schema">Schema Sync</TabsTrigger>
            <TabsTrigger value="imports">Histórico de Cargas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-dashed border-primary/30 bg-primary/5 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-foreground">Estado Geral da Rede</h2>
                  <p className="text-sm text-muted-foreground">
                    As ações antes espalhadas por cliente agora ficam concentradas aqui: leitura de drift, sincronização manual e histórico operacional por tenant.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border/60 bg-background">
                    {isLoadingSchema ? "Carregando schema..." : `${schemaStatus.filter(s => (s.totalDiffs ?? 0) > 0).length} tenant(s) divergentes`}
                  </Badge>
                  <Badge variant="outline" className="border-border/60 bg-background">
                    {allImports.length} evento(s) de importação
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`border-border/60 ${
                      overview.publicConfigOk === overview.total
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {overview.publicConfigOk}/{overview.total} config pública OK
                  </Badge>
                </div>
              </div>
            </Card>

            {isLoadingClients ? (
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Carregando tenants...</span>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {snapshots.map((snapshot) => (
                  <TenantCard 
                    key={snapshot.client.id} 
                    snapshot={snapshot} 
                    schemaStatus={schemaStatus} 
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="exports" className="space-y-4">
            <Card className="border-dashed border-primary/30 bg-primary/5 p-6">
              <h2 className="text-lg font-semibold text-foreground">Observabilidade de Exportação (JSONL)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhamento granular das exportações operacionais. Cada tenant deve exportar tabelas críticas para o backup lógico.
              </p>
            </Card>

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
                <Button onClick={handleRunSchemaAudit} disabled={isAuditingSchema}>
                  {isAuditingSchema ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                  Executar Auditoria Profunda
                </Button>
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

          <TabsContent value="imports" className="space-y-4">
            <Card className="border-dashed border-primary/30 bg-primary/5 p-6">
              <h2 className="text-lg font-semibold text-foreground">Histórico consolidado de importações</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use esta visão para detectar cargas quebradas, filas presas e tenants com necessidade de intervenção operacional.
              </p>
            </Card>

            <ImportHistoryCard 
              allImports={allImports} 
              clients={clients} 
              isLoadingImports={isLoadingImports} 
            />
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
          <DialogContent className="max-w-4xl">
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
                para alinhar{" "}
                <code>{driftPreview ? `${driftPreview.schema}.${driftPreview.objectName}` : ""}</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-slate-300">
                O SQL abaixo é derivado do estado real do Oeiras. Para views, as colunas e grants
                relacionados são alinhados pela mesma operação.
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

              <ScrollArea className="h-[420px] rounded-md border border-border/60 bg-secondary/10 p-3 dark:border-sky-900/40 dark:bg-slate-950/40">
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
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
