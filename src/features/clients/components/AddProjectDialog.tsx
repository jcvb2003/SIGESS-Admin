import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Loader2, Rocket, Shield, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { startProjectOnboarding, getOnboardingJobStatus } from "@/services/projects.service";
import { useSupabaseAccounts } from "../../settings/hooks/useSystemSettings";
import { projectsQueryKey } from "../hooks/useProjects";

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: Record<string, string> = {
  pending:            "Iniciando",
  fetching_keys:      "Coletando chaves e configurando credenciais",
  configuring_auth:   "Configurando Auth, SMTP e Segurança",
  running_migrations: "Injetando estrutura de dados",
  seeding:            "Carregando dados iniciais",
  creating_admin:     "Criando usuário Master",
  registering_tenant: "Registrando na Base Admin Central",
  finalizing_setup:   "Finalizando configurações públicas",
  completed:          "Tudo pronto!",
  failed:             "Falha no processo",
};

export function AddProjectDialog({ open, onOpenChange }: Readonly<AddProjectDialogProps>) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useSupabaseAccounts();

  const [projectCode, setProjectCode]         = useState("");
  const [projectName, setProjectName]         = useState("");
  const [projectRef, setProjectRef]           = useState("");
  const [adminEmail, setAdminEmail]           = useState("");
  const [supabaseAccountId, setSupabaseAccountId] = useState("");

  const [jobId, setJobId]           = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const { data: job, isError: isJobError } = useQuery({
    queryKey: ["onboardingJob", jobId],
    queryFn: () => {
      if (!jobId) throw new Error("jobId is required");
      return getOnboardingJobStatus(jobId);
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "completed" || s === "failed" ? false : 2500;
    },
  });

  const handleStart = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!projectCode || !projectName || !projectRef || !supabaseAccountId) return;

    setIsStarting(true);
    setJobId(null);
    try {
      const response = await startProjectOnboarding({
        tenantCode:         projectCode,
        tenantLabel:        projectName,
        projectRef,
        supabaseAccountId,
        adminEmail:         adminEmail || undefined,
      });
      setJobId(response.jobId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao iniciar o processo.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = () => {
    if (job?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      setProjectCode("");
      setProjectName("");
      setProjectRef("");
      setAdminEmail("");
      setSupabaseAccountId("");
    }
    setJobId(null);
    onOpenChange(false);
  };

  const isRunning  = !!jobId;
  const isDone     = job?.status === "completed";
  const isFailed   = job?.status === "failed";
  const isPolling  = isRunning && !isDone && !isFailed && !isJobError;
  const progress   = job ? ((job.current_step ?? 0) / Math.max(job.total_steps ?? 1, 1)) * 100 : 0;
  const stepLabel  = job?.status ? (STEPS[job.status] ?? job.status) : "Aguardando...";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Novo Projeto
          </DialogTitle>
          <DialogDescription>
            Provisiona um projeto Supabase e registra-o no Admin Central.
            O primeiro cliente será definido dentro do projeto após o onboarding.
          </DialogDescription>
        </DialogHeader>

        {!isRunning && (
          <form onSubmit={handleStart} className="space-y-5 pt-2 overflow-y-auto flex-1 pr-1">

            <div className="space-y-1.5">
              <Label>Conta Supabase Destino</Label>
              <Select value={supabaseAccountId} onValueChange={setSupabaseAccountId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => {
                    const isFull = (acc.active_projects ?? 0) >= (acc.max_projects ?? 999);
                    return (
                      <SelectItem key={acc.id} value={acc.id!} disabled={isFull}>
                        <div className="flex items-center gap-2">
                          <Shield className={`h-3 w-3 ${isFull ? "text-muted-foreground" : "text-primary"}`} />
                          <span>{acc.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({acc.active_projects}/{acc.max_projects})
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {accounts.length === 0 && (
                <p className="text-xs text-destructive">Nenhuma conta cadastrada em Configurações.</p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Projeto
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="projectName">Nome do Projeto</Label>
                <Input
                  id="projectName"
                  placeholder="Ex: Projeto Pará"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="projectCode">Código</Label>
                <Input
                  id="projectCode"
                  placeholder="Ex: sinpesca-breves"
                  value={projectCode}
                  onChange={(e) => setProjectCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Apenas letras minúsculas, números e hífen. Identificador único global.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Infraestrutura
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="projectRef" className="flex items-center gap-2">
                  Project Reference ID
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Onde encontrar <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </Label>
                <Input
                  id="projectRef"
                  placeholder="Ex: vdwupmfpfkaempsiqfgb"
                  value={projectRef}
                  onChange={(e) => setProjectRef(e.target.value.trim())}
                  className="font-mono text-sm"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Encontrado na URL: supabase.com/dashboard/project/<strong>ref</strong>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adminEmail">
                  Email do Administrador Master{" "}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="admin@entidade.com.br"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                type="submit"
                disabled={isStarting || !supabaseAccountId || !projectName || !projectCode || !projectRef}
              >
                {isStarting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Rocket className="mr-2 h-4 w-4" />}
                Iniciar Onboarding
              </Button>
            </div>
          </form>
        )}

        {isRunning && (
          <div className="space-y-6 pt-2 overflow-y-auto flex-1">
            {!job && !isJobError && (
              <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm">Iniciando processo para <span className="font-medium text-foreground">{projectName}</span>…</p>
              </div>
            )}
            {isJobError && !job && (
              <div className="flex flex-col items-center gap-3 py-6 text-destructive">
                <AlertCircle className="h-10 w-10" />
                <p className="text-sm font-medium">Falha ao consultar o status do job.</p>
              </div>
            )}
            {job && (
              <>
                <div className="flex flex-col items-center gap-2">
                  {isDone && (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                        <Check className="h-7 w-7 text-emerald-500" />
                      </div>
                      <p className="text-base font-semibold text-foreground">Projeto provisionado!</p>
                      <p className="text-xs text-muted-foreground">
                        {projectName} está pronto. Acesse o projeto para definir os clientes.
                      </p>
                    </>
                  )}
                  {isFailed && (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                        <X className="h-7 w-7 text-destructive" />
                      </div>
                      <p className="text-base font-semibold text-foreground">Falha no processo</p>
                    </>
                  )}
                  {isPolling && (
                    <>
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">
                        Processando <span className="font-medium text-foreground">{projectName}</span>…
                      </p>
                    </>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{stepLabel}</span>
                    {(job.total_steps ?? 0) > 0 && (
                      <span className="font-mono">{job.current_step}/{job.total_steps}</span>
                    )}
                  </div>
                  <Progress value={progress} className="h-1.5" />
                </div>

                {job.error_detail && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                    <p className="mb-1 text-xs font-semibold text-destructive">Detalhe técnico</p>
                    <code className="block max-h-28 overflow-auto break-all text-[11px] text-destructive/80">
                      {job.error_detail}
                    </code>
                  </div>
                )}

                {isDone && <Button onClick={handleClose} className="w-full">Ver projeto</Button>}
                {isFailed && (
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => void handleStart()} className="w-full">
                      <Rocket className="mr-2 h-4 w-4" />
                      Tentar novamente
                    </Button>
                    <Button onClick={() => setJobId(null)} variant="outline" className="w-full">
                      Corrigir dados e reiniciar
                    </Button>
                    <Button onClick={handleClose} variant="ghost" className="w-full text-muted-foreground">
                      Cancelar
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
