import {
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Rocket,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useProjects } from "@/features/clients/hooks/useProjects";
import { useObservability } from "../hooks/useObservability";
import { SchemaDriftCard } from "../components/SchemaDriftCard";
import { BackupDashboard } from "../components/BackupDashboard";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="absolute right-2 top-2 z-10 rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title="Copiar SQL"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function ObservabilityPage() {
  const { data: projects = [] } = useProjects();

  const {
    adHocReferenceId,
    setAdHocReferenceId,
    adHocTargetId,
    setAdHocTargetId,
    adHocResults,
    isRunningAdHocAudit,
    handleRunAdHocAudit,
    handleClearAdHoc,
    isRefreshing,
    isPreparingDrift,
    isApplyingDrift,
    driftPreview,
    driftApplyResults,
    setDriftPreview,
    setDriftApplyResults,
    handleRefresh,
    handlePrepareSchemaSync,
    handleApplySchemaSync,
  } = useObservability();

  const displayStatus = useMemo(() => {
    if (!adHocResults) return [];
    if (adHocTargetId) return adHocResults.filter((r) => r.projectId === adHocTargetId);
    return adHocResults;
  }, [adHocResults, adHocTargetId]);

  const referenceName = useMemo(() => {
    if (!adHocReferenceId) return "referência";
    return projects.find((p) => p.id === adHocReferenceId)?.project_name ?? "referência";
  }, [adHocReferenceId, projects]);


  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Observabilidade</h1>
            <p className="text-muted-foreground">
              Monitoramento em tempo real da saúde, schema e integridade dos dados de todos os projetos.
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

        <Tabs defaultValue="schema" className="space-y-6">
          <TabsList className="bg-secondary/60">
            <TabsTrigger value="schema">Schema Sync</TabsTrigger>
            <TabsTrigger value="backups">Backups</TabsTrigger>
          </TabsList>

          <TabsContent value="schema" className="space-y-4">
            {/* Seletor de comparação */}
            <Card className="p-5">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Comparação configurável</p>
                    <p className="text-xs text-muted-foreground">
                      Selecione uma referência e um alvo para comparação sob demanda. Sem seleção, usa o cache global.
                    </p>
                  </div>
                  {adHocResults !== null && (
                    <Button variant="ghost" size="sm" onClick={handleClearAdHoc} className="text-muted-foreground">
                      <X className="mr-1 h-3 w-3" />
                      Limpar
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">Referência</p>
                    <Select
                      value={adHocReferenceId ?? ""}
                      onValueChange={(v) => {
                        setAdHocReferenceId(v || null);
                        if (v === adHocTargetId) setAdHocTargetId(null);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Escolher referência..." />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.project_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">Alvo (opcional — vazio = todos)</p>
                    <Select
                      value={adHocTargetId ?? ""}
                      onValueChange={(v) => setAdHocTargetId(v || null)}
                      disabled={!adHocReferenceId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Todos os projetos" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects
                          .filter((p) => p.id !== adHocReferenceId)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.project_name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleRunAdHocAudit}
                    disabled={!adHocReferenceId || isRunningAdHocAudit}
                    className="sm:w-auto"
                  >
                    {isRunningAdHocAudit ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="mr-2 h-4 w-4" />
                    )}
                    Comparar
                  </Button>
                </div>
              </div>
            </Card>

            {/* Banner de resultado ativo */}
            {adHocResults !== null && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-200">
                Comparação concluída — referência: <strong>{referenceName}</strong>
                {adHocTargetId
                  ? ` → ${projects.find((p) => p.id === adHocTargetId)?.project_name ?? adHocTargetId}`
                  : ` → ${displayStatus.length} projeto(s)`}
              </div>
            )}

            {isRunningAdHocAudit ? (
              <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
                <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Executando comparação...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {displayStatus.map((status) => (
                  <SchemaDriftCard
                    key={status.projectId}
                    status={status}
                    schemaStatus={displayStatus}
                    isPreparingDrift={isPreparingDrift}
                    onPrepareSync={handlePrepareSchemaSync}
                    referenceName={referenceName}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="backups" className="space-y-4">
            <BackupDashboard />
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
                      ? driftPreview.targets[0].projectName
                      : `${driftPreview.targets.length} projetos`;
                  })()}
                </strong>{" "}
                para alinhar <code>{driftPreview?.title ?? ""}</code>.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-slate-300">
                {driftPreview?.description ??
                  `O SQL abaixo é derivado do estado real de ${referenceName}. Para views, as colunas e grants relacionados são alinhados pela mesma operação.`}
              </div>
              
              {driftPreview && driftPreview.targets.length > 1 && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
                  Este apply será executado sequencialmente para:
                  <div className="mt-2 flex flex-wrap gap-2">
                    {driftPreview.targets.map((target) => (
                      <Badge
                        key={target.projectId}
                        variant="outline"
                        className="border-emerald-300 bg-background/70 text-emerald-800 dark:border-emerald-900 dark:bg-slate-950/40 dark:text-emerald-200"
                      >
                        {target.projectName}
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
                        key={result.projectId}
                        className="flex flex-col gap-2 rounded-md border border-border/50 bg-secondary/10 p-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{result.projectName}</p>
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

              <div className="relative">
                <CopyButton text={driftPreview?.sql ?? ""} />
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
                    ? `Aplicar em ${driftPreview.targets.length} projetos`
                    : "Aplicar no projeto"}
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
