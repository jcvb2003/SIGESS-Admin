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
import { startTenantOnboarding, getOnboardingJobStatus } from "@/services/clients.service";
import { useSupabaseAccounts } from "../../settings/hooks/useSystemSettings";

interface AddTenantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: Record<string, string> = {
  pending:              "Iniciando",
  fetching_keys:        "Coletando chaves e configurando credenciais",
  configuring_auth:     "Configurando Auth, SMTP e Segurança",
  running_migrations:   "Injetando estrutura de dados",
  seeding:              "Carregando dados iniciais",
  creating_admin:       "Criando usuário Master",
  registering_tenant:   "Registrando na Base Admin Central",
  finalizing_setup:     "Finalizando configurações públicas",
  completed:            "Tudo pronto!",
  failed:               "Falha no processo",
};

export function AddTenantDialog({ open, onOpenChange }: Readonly<AddTenantDialogProps>) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useSupabaseAccounts();

  const [tenantCode, setTenantCode]         = useState("");
  const [tenantLabel, setTenantLabel]       = useState("");
  const [projectRef, setProjectRef]         = useState("");
  const [adminEmail, setAdminEmail]         = useState("");
  const [supabaseAccountId, setSupabaseAccountId] = useState("");
  const [maxSocios, setMaxSocios]           = useState("");
  const [acessoExpiraEm, setAcessoExpiraEm] = useState("");

  const [jobId, setJobId]       = useState<string | null>(null);
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
    if (!tenantCode || !tenantLabel || !projectRef || !supabaseAccountId) return;

    setIsStarting(true);
    setJobId(null);
    try {
      const response = await startTenantOnboarding({
        tenantCode,
        tenantLabel,
        projectRef,
        supabaseAccountId,
        adminEmail: adminEmail || undefined,
        maxSocios: maxSocios ? parseInt(maxSocios, 10) : null,
        acessoExpiraEm: acessoExpiraEm || null,
      });
      setJobId(response.jobId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Falha ao iniciar o processo.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = () => {
    if (job?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setTenantCode("");
      setTenantLabel("");
      setProjectRef("");
      setAdminEmail("");
      setSupabaseAccountId("");
      setMaxSocios("");
      setAcessoExpiraEm("");
    }
    setJobId(null);
    onOpenChange(false);
  };

  const isRunning = !!jobId;
  const isDone    = job?.status === "completed";
  const isFailed  = job?.status === "failed";
  const isPolling = isRunning && !isDone && !isFailed && !isJobError;

  const progressPercent = job
    ? ((job.current_step ?? 0) / Math.max(job.total_steps ?? 1, 1)) * 100
    : 0;

  const currentStepLabel = job?.status ? (STEPS[job.status] ?? job.status) : "Aguardando...";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Onboarding de Tenant
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do projeto Supabase para inicializá-lo e conectá-lo automaticamente.
          </DialogDescription>
        </DialogHeader>

        {/* ── FORMULÁRIO ── */}
        {!isRunning && (
          <form onSubmit={handleStart} className="space-y-5 pt-2 overflow-y-auto flex-1 pr-1">

            {/* Conta destino */}
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
                <p className="text-xs text-destructive">
                  Nenhuma conta cadastrada em Configurações.
                </p>
              )}
            </div>

            {/* Separador visual — Identidade */}
            <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Identidade
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="tenantLabel">Nome da Entidade</Label>
                <Input
                  id="tenantLabel"
                  placeholder="Ex: Sindicato dos Pescadores"
                  value={tenantLabel}
                  onChange={(e) => setTenantLabel(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tenantCode">Código do Tenant</Label>
                <Input
                  id="tenantCode"
                  placeholder="Ex: sinpesca-breves"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Apenas letras minúsculas, números e hífen. Usado como identificador público.
                </p>
              </div>
            </div>

            {/* Separador visual — Infraestrutura */}
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
                    Onde encontrar
                    <ExternalLink className="h-2.5 w-2.5" />
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
                  Encontrado na URL do projeto: supabase.com/dashboard/project/<strong>ref</strong>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adminEmail">
                  Email do Administrador Master{" "}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
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

            {/* Separador visual — Contrato */}
            <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Contrato
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="maxSocios">Limite de Sócios</Label>
                <Input
                  id="maxSocios"
                  type="number"
                  min={1}
                  placeholder="Ex: 500"
                  value={maxSocios}
                  onChange={(e) => setMaxSocios(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acessoExpiraEm">Acesso expira em</Label>
                <Input
                  id="acessoExpiraEm"
                  type="date"
                  value={acessoExpiraEm}
                  onChange={(e) => setAcessoExpiraEm(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isStarting || !supabaseAccountId || !tenantLabel || !tenantCode || !projectRef || !maxSocios || !acessoExpiraEm}
              >
                {isStarting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Rocket className="mr-2 h-4 w-4" />}
                Iniciar Onboarding
              </Button>
            </div>
          </form>
        )}

        {/* ── PROGRESSO ── */}
        {isRunning && (
          <div className="space-y-6 pt-2 overflow-y-auto flex-1">

            {/* Estado: carregando primeiro retorno */}
            {!job && !isJobError && (
              <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm">Iniciando processo para <span className="font-medium text-foreground">{tenantLabel}</span>…</p>
              </div>
            )}

            {/* Estado: erro de rede */}
            {isJobError && !job && (
              <div className="flex flex-col items-center gap-3 py-6 text-destructive">
                <AlertCircle className="h-10 w-10" />
                <p className="text-sm font-medium">Falha ao consultar o status do job.</p>
                <p className="text-xs text-muted-foreground">Verifique a conexão com o servidor.</p>
              </div>
            )}

            {/* Estado: job retornado */}
            {job && (
              <>
                {/* Ícone de estado */}
                <div className="flex flex-col items-center gap-2">
                  {isDone && (
                    <>
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                        <Check className="h-7 w-7 text-emerald-500" />
                      </div>
                      <p className="text-base font-semibold text-foreground">Tenant onboarded!</p>
                      <p className="text-xs text-muted-foreground">{tenantLabel} está pronto para uso.</p>
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
                        Processando <span className="font-medium text-foreground">{tenantLabel}</span>…
                      </p>
                    </>
                  )}
                </div>

                {/* Barra de progresso */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{currentStepLabel}</span>
                    {(job.total_steps ?? 0) > 0 && (
                      <span className="font-mono">{job.current_step}/{job.total_steps}</span>
                    )}
                  </div>
                  <Progress value={progressPercent} className="h-1.5" />
                </div>

                {/* Detalhe de erro */}
                {job.error_detail && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left">
                    <p className="mb-1 text-xs font-semibold text-destructive">Detalhe técnico</p>
                    <code className="block max-h-28 overflow-auto break-all text-[11px] text-destructive/80">
                      {job.error_detail}
                    </code>
                  </div>
                )}

                {/* Ações */}
                {isDone && (
                  <Button onClick={handleClose} className="w-full">
                    Finalizar e ver tenant
                  </Button>
                )}

                {isFailed && (
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => void handleStart()} className="w-full">
                      <Rocket className="mr-2 h-4 w-4" />
                      Tentar novamente
                    </Button>
                    <Button
                      onClick={() => setJobId(null)}
                      variant="outline"
                      className="w-full"
                    >
                      Corrigir dados e reiniciar
                    </Button>
                    <Button
                      onClick={handleClose}
                      variant="ghost"
                      className="w-full text-muted-foreground"
                    >
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
