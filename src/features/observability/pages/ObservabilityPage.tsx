import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Globe2,
  HelpCircle,
  Loader2,
  RefreshCw,
  Rocket,
  ServerCrash,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClients } from "@/features/clients";
import type { Client } from "@/features/clients";
import { supabase } from "@/lib/supabase";
import { proxyAction } from "@/services/clients.service";
import { getSchemaSyncStatus, runSchemaAudit } from "@/features/observability/services/schema-sync.service";
import type { TenantSchemaStatus } from "@/features/observability/model/schema-comparator";

type ExportRun = {
  id: string;
  run_id: string;
  tenant_code: string;
  tenant_name: string;
  tabela: string;
  status: "running" | "success" | "failed" | "skipped";
  skip_reason: string | null;
  file_size_bytes: number | null;
  error_detail: string | null;
  executed_at: string;
};

type ImportRecord = {
  id: string;
  tenant_id: string | null;
  tabela: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_registros: number;
  created_at: string;
  erro_detalhe: string | null;
};

type TenantSnapshot = {
  client: Client;
  imports: ImportRecord[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR");
}

function HealthBadge({ client }: { client: Client }) {
  if (client.key_status === "valid") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        Saudavel
      </Badge>
    );
  }

  if (client.key_status === "broken") {
    return <Badge variant="destructive">Conexao quebrada</Badge>;
  }

  return <Badge variant="secondary">Status desconhecido</Badge>;
}



function SchemaBadge({ clientId, schemaStatus }: { clientId: string; schemaStatus: TenantSchemaStatus[] }) {
  const s = schemaStatus.find(x => x.tenantId === clientId);
  if (!s) return <Badge variant="secondary">Aguardando</Badge>;
  if (s.totalDiffs === 0) return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
      Alinhado
    </Badge>
  );
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
      Drift: {s.totalDiffs}
    </Badge>
  );
}

export default function ObservabilityPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading: isLoadingClients } = useClients();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: allImports = [], isLoading: isLoadingImports } = useQuery<ImportRecord[]>({
    queryKey: ["global-data-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_imports")
        .select("id, tenant_id, tabela, status, total_registros, created_at, erro_detalhe")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const snapshots = useMemo<TenantSnapshot[]>(() => {
    const importsByTenant = new Map<string, ImportRecord[]>();

    for (const item of allImports) {
      if (!item.tenant_id) continue;
      const group = importsByTenant.get(item.tenant_id) ?? [];
      group.push(item);
      importsByTenant.set(item.tenant_id, group);
    }

    return clients.map((client) => {
      return {
        client,
        imports: importsByTenant.get(client.id) ?? [],
      };
    });
  }, [allImports, clients]);

  const { data: exportRuns = [], isLoading: isLoadingExports } = useQuery<ExportRun[]>({
    queryKey: ["global-export-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("export_runs")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(200); // Pegar os últimos 200 registros para cobrir os ciclos recentes de todos tenants

      if (error) throw error;
      return (data as any) || [];
    },
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  const { data: schemaStatus = [], isLoading: isLoadingSchema } = useQuery<TenantSchemaStatus[]>({
    queryKey: ["global-schema-status"],
    queryFn: getSchemaSyncStatus,
    staleTime: 1000 * 60 * 5, // 5 min cache
  });

  const [isAuditingSchema, setIsAuditingSchema] = useState(false);
  const handleRunSchemaAudit = async () => {
    setIsAuditingSchema(true);
    try {
      await runSchemaAudit();
      toast.success("Auditoria de Schema finalizada com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["global-schema-status"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro desconhecido na auditoria.");
    } finally {
      setIsAuditingSchema(false);
    }
  };


  const overview = useMemo(() => {
    const healthy = snapshots.filter((item) => item.client.key_status === "valid").length;
    const failedImports = snapshots.reduce(
      (acc, item) => acc + item.imports.filter((entry) => entry.status === "failed").length,
      0,
    );
    const processingImports = snapshots.reduce(
      (acc, item) => acc + item.imports.filter((entry) => ["pending", "processing"].includes(entry.status)).length,
      0,
    );

    return {
      total: clients.length,
      healthy,
      failedImports,
      processingImports,
    };
  }, [snapshots, clients]);


  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["global-schema-status"] });
      await queryClient.invalidateQueries({ queryKey: ["global-export-runs"] });
      toast.success("Observabilidade atualizada.");
    } finally {
      setIsRefreshing(false);
    }
  };



  if (isLoadingClients) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="w-fit border-primary/30 bg-primary/5 text-primary">
              Centro de comando
            </Badge>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Observabilidade</h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                O staging em Oeiras e a fonte de verdade. Esta area consolida drift, historico de importacoes e disparos manuais de sincronizacao por tenant.
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Atualizar panorama
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="group relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
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
            <TabsTrigger value="overview" className="gap-2">
              <Activity className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="exports" className="gap-2">
              <Database className="h-4 w-4" />
              Exports
            </TabsTrigger>
            <TabsTrigger value="schema" className="gap-2">
              <Database className="h-4 w-4" />
              Schema Drift
            </TabsTrigger>
            <TabsTrigger value="imports" className="gap-2">
              <Database className="h-4 w-4" />
              Importações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-dashed border-primary/30 bg-primary/5 p-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Controle operacional centralizado</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    As acoes antes espalhadas por cliente agora ficam concentradas aqui: leitura de drift, sincronizacao manual e historico operacional por tenant.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-border/60 bg-background">
                    {isLoadingSchema ? "Carregando schema..." : `${schemaStatus.filter(s => (s.totalDiffs ?? 0) > 0).length} tenant(s) divergentes`}
                  </Badge>
                  <Badge variant="outline" className="border-border/60 bg-background">
                    {allImports.length} evento(s) de importação
                  </Badge>
                </div>
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              {snapshots.map((snapshot) => {
                const latestImport = snapshot.imports[0];

                return (
                  <Card key={snapshot.client.id} className="p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground">{snapshot.client.nome_entidade}</h3>
                            <HealthBadge client={snapshot.client} />
                            <SchemaBadge clientId={snapshot.client.id} schemaStatus={schemaStatus} />
                          </div>
                          <p className="text-sm text-muted-foreground">{snapshot.client.supabase_url}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/clients/${snapshot.client.id}`)}>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Schema</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">
                            {(() => {
                              const s = schemaStatus.find(x => x.tenantId === snapshot.client.id);
                              if (!s) return "Pendente";
                              return s.totalDiffs === 0 ? "Alinhado" : `${s.totalDiffs} Diverg.`;
                            })()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(() => {
                              const s = schemaStatus.find(x => x.tenantId === snapshot.client.id);
                              if (!s) return "Aguardando auditoria";
                              return s.totalDiffs === 0 ? "100% Sincronizado" : "Requer atenção";
                            })()}
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Ultimo health check</p>
                          <p className="mt-2 text-sm font-medium text-foreground">{formatDateTime(snapshot.client.last_health_check_at)}</p>
                          <p className="text-xs text-muted-foreground">
                            {snapshot.client.health_error_detail ?? "Sem erros recentes"}
                          </p>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Importacoes</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">{snapshot.imports.length}</p>
                          <p className="text-xs text-muted-foreground">
                            {latestImport
                              ? `${latestImport.tabela} · ${formatDateTime(latestImport.created_at)}`
                              : "Sem historico"}
                          </p>
                        </div>
                      </div>

                        <Button variant="outline" onClick={() => navigate(`/clients/${snapshot.client.id}`)} className="w-full sm:w-auto">
                          Ver detalhes do tenant
                        </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="exports" className="space-y-4">
            <Card className="border-dashed border-primary/30 bg-primary/5 p-6">
              <h2 className="text-lg font-semibold text-foreground">Observabilidade de Exportacao (JSONL)</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhamento granular das exportacoes operacionais. Cada tenant deve exportar 4 tabelas criticas.
              </p>
            </Card>

            {isLoadingExports ? (
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Carregando logs de exportacao...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {clients.map((client) => {
                  // Filtra runs deste cliente
                  const clientRuns = exportRuns.filter(r => r.tenant_code === client.tenant_code);
                  
                  // Identifica o run_id mais recente para este tenant
                  const latestRunId = clientRuns[0]?.run_id;
                  const latestCycle = clientRuns.filter(r => r.run_id === latestRunId);
                  
                  const hasFailed = latestCycle.some(r => r.status === 'failed');
                  const isRunning = latestCycle.some(r => r.status === 'running');
                  const lastUpdate = latestCycle[0]?.executed_at;

                  const TABELAS_EXPECTED = [
                    'socios',
                    'reap',
                    'requerimentos',
                    'financeiro_lancamentos',
                    'financeiro_cobrancas_geradas',
                    'financeiro_dae',
                    'financeiro_historico_regime',
                    'financeiro_config_socio',
                    'localidades',
                    'templates',
                    'configuracao_entidade',
                    'parametros',
                    'logs_eventos_requerimento',
                    'audit_log_financeiro',
                  ];

                  return (
                    <Card key={`export-${client.id}`} className="p-5 overflow-hidden">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-border/50 pb-3">
                          <div className="space-y-1">
                            <h3 className="font-semibold text-foreground">{client.nome_entidade}</h3>
                            <p className="text-xs text-muted-foreground">
                              Code: <code className="bg-secondary/40 px-1 rounded">{client.tenant_code}</code>
                            </p>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            {hasFailed ? (
                              <Badge variant="destructive" className="animate-pulse">Ciclo com falhas</Badge>
                            ) : isRunning ? (
                              <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 animate-pulse">Em andamento</Badge>
                            ) : latestCycle.length > 0 ? (
                              <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50">Ciclo Saudavel</Badge>
                            ) : (
                              <Badge variant="secondary">Sem registros</Badge>
                            )}
                            <p className="text-[10px] text-muted-foreground uppercase font-medium">
                              {lastUpdate ? `Atualizado em ${formatDateTime(lastUpdate)}` : "Nunca executado"}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {TABELAS_EXPECTED.map(tabela => {
                            const run = latestCycle.find(r => r.tabela === tabela);
                            
                            let StatusIcon = <HelpCircle className="h-4 w-4 text-muted-foreground" />;
                            let statusText = "Sem dados";
                            let statusColor = "text-muted-foreground";
                            let bgClass = "bg-secondary/5";
                            let details = "";

                            if (run) {
                              if (run.status === 'success') {
                                StatusIcon = <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
                                statusText = "Sucesso";
                                statusColor = "text-emerald-700";
                                bgClass = "bg-emerald-500/10 border-emerald-500/20";
                                
                                const bytes = run.file_size_bytes || 0;
                                details = bytes === 0 ? "0 B" : bytes < 1024 ? "< 1 KB" : `${Math.round(bytes / 1024)} KB`;
                              } else if (run.status === 'failed') {
                                StatusIcon = <XCircle className="h-4 w-4 text-destructive" />;
                                statusText = "Falha";
                                statusColor = "text-destructive";
                                bgClass = "bg-destructive/10 border-destructive/20";
                                details = run.error_detail || "Erro desconhecido";
                              } else if (run.status === 'skipped') {
                                StatusIcon = <AlertTriangle className="h-4 w-4 text-amber-500" />;
                                statusText = "Pulado";
                                statusColor = "text-amber-700";
                                bgClass = "bg-amber-500/10 border-amber-500/20";
                                details = run.skip_reason === 'empty_table' ? "Tabela vazia" : run.skip_reason || "";
                              } else if (run.status === 'running') {
                                StatusIcon = <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
                                statusText = "Processando";
                                statusColor = "text-blue-700";
                                bgClass = "bg-blue-500/10 border-blue-500/20";
                              }
                            }

                            return (
                              <div key={tabela} className={`flex items-center justify-between rounded-lg border p-2 text-xs transition-colors ${bgClass}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                  {StatusIcon}
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-medium text-foreground truncate">{tabela}</span>
                                    {details && <span className={`truncate opacity-80 ${statusColor}`}>{details}</span>}
                                  </div>
                                </div>
                                <span className={`font-semibold uppercase text-[10px] ${statusColor}`}>{statusText}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Card>
                  );
                })}
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
                  <Card key={status.tenantId} className="p-5">
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

                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-muted-foreground">Detalhes das Divergências</h4>
                          <div className="max-h-96 overflow-y-auto rounded-md border border-border/50 bg-secondary/10 p-2">
                            {status.diffs.map((diff, idx) => (
                              <div key={`${diff.category}-${diff.key}-${idx}`} className="mb-2 rounded border border-border/50 bg-background p-3 text-sm last:mb-0">
                                <div className="flex items-center gap-2 font-medium">
                                  <Badge variant="outline" className="uppercase text-xs">{diff.category}</Badge>
                                  <span className="text-foreground">{diff.key}</span>
                                  <Badge 
                                    variant={diff.type === 'missing_in_tenant' ? 'destructive' : diff.type === 'extra_in_tenant' ? 'default' : 'secondary'}
                                    className="ml-auto"
                                  >
                                    {diff.type === 'missing_in_tenant' ? 'Ausente no Tenant' : diff.type === 'extra_in_tenant' ? 'Extra no Tenant' : 'Diferença de Definição'}
                                  </Badge>
                                </div>
                                {diff.type === 'definition_mismatch' && (
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
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="imports" className="space-y-4">
            <Card className="border-dashed border-primary/30 bg-primary/5 p-6">
              <h2 className="text-lg font-semibold text-foreground">Historico consolidado de importacoes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use esta visao para detectar cargas quebradas, filas presas e tenants com necessidade de intervencao operacional.
              </p>
            </Card>

            {isLoadingImports ? (
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Carregando historico de importacoes...</span>
              </div>
            ) : (
              <Card className="border border-border">
                <div className="border-b bg-secondary/30 px-4 py-3">
                  <span className="text-sm font-medium">Eventos recentes ({allImports.length})</span>
                </div>

                {!allImports.length ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhuma importacao registrada ate o momento.
                  </div>
                ) : (
                  <ScrollArea className="h-[520px]">
                    <div className="space-y-2 p-3">
                      {allImports.map((item) => {
                        const client = clients.find((entry) => entry.id === item.tenant_id);

                        return (
                          <div key={item.id} className="rounded-xl border border-border/60 p-4 transition-colors hover:bg-secondary/20">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-foreground">{client?.nome_entidade ?? "Tenant removido"}</p>
                                  <Badge variant="outline" className="font-mono text-[10px]">
                                    {item.tabela}
                                  </Badge>
                                  <Badge
                                    variant={item.status === "failed" ? "destructive" : "secondary"}
                                    className={item.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : ""}
                                  >
                                    {item.status}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {item.total_registros} registro(s) · {formatDateTime(item.created_at)}
                                </p>
                                {item.erro_detalhe ? (
                                  <p className="break-all rounded-md bg-destructive/5 p-2 font-mono text-xs text-destructive/80">
                                    {item.erro_detalhe}
                                  </p>
                                ) : null}
                              </div>

                              {client ? (
                                <Button variant="ghost" onClick={() => navigate(`/clients/${client.id}`)}>
                                  Abrir tenant
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
