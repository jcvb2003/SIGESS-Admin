import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, Loader2, Play, Shield } from "lucide-react";
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

export function AddTenantDialog({ open, onOpenChange }: Readonly<AddTenantDialogProps>) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useSupabaseAccounts();

  const [tenantCode, setTenantCode] = useState("");
  const [tenantLabel, setTenantLabel] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [supabaseAccountId, setSupabaseAccountId] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Auto-polling the job tracker
  const { data: job, isError } = useQuery({
    queryKey: ['onboardingJob', jobId],
    queryFn: () => {
      if (!jobId) throw new Error("jobId is required");
      return getOnboardingJobStatus(jobId);
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') {
        return false;
      }
      return 2500;
    },
  });

  const handleStart = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tenantCode || !tenantLabel || !projectRef || !supabaseAccountId) return;

    setIsStarting(true);
    setJobId(null); // Limpa job anterior se houver
    try {
      const response = await startTenantOnboarding({
        tenantCode,
        tenantLabel,
        projectRef,
        supabaseAccountId,
        adminEmail: adminEmail || undefined,
      });
      setJobId(response.jobId);
    } catch (error) {
      console.error(error);
      alert("Falha ao iniciar o processo.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = () => {
    // Só limpamos os dados se o processo terminou com SUCESSO
    if (job?.status === 'completed') {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setTenantCode("");
      setTenantLabel("");
      setProjectRef("");
      setAdminEmail("");
      setSupabaseAccountId("");
    }
    setJobId(null);
    onOpenChange(false);
  };

  const handleReturnToForm = () => {
    setJobId(null);
  };

  const stepsMapping: Record<string, string> = {
    'pending': 'Iniciando',
    'fetching_keys': 'Coletando chaves e configurando credenciais',
    'configuring_auth': 'Configurando Auth, SMTP e Segurança',
    'running_migrations': 'Injetando estrutura de dados (Migrations)',
    'seeding': 'Carregando dados iniciais',
    'creating_admin': 'Criando usuário Master',
    'registering_tenant': 'Registrando na Base Admin Central',
    'finalizing_setup': 'Finalizando configurações públicas...',
    'completed': 'Tudo pronto!',
    'failed': 'Falha no processo'
  };

  const currentStatusMsg = job?.status ? stepsMapping[job.status] : '';
  const progressPercent = job ? ((job.current_step ?? 0) / (job.total_steps ?? 1)) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Onboarding de Cliente</DialogTitle>
          <DialogDescription>
            Passe os dados do novo projeto do Supabase para inicializá-lo e conectá-lo.
          </DialogDescription>
        </DialogHeader>

        {!jobId && (
          <form onSubmit={handleStart} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Conta Supabase Destino</Label>
              <Select value={supabaseAccountId} onValueChange={setSupabaseAccountId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => {
                    const isFull = (acc.active_projects || 0) >= (acc.max_projects || 999);
                    return (
                      <SelectItem
                        key={acc.id}
                        value={acc.id!}
                        disabled={isFull}
                      >
                        <div className="flex items-center gap-2">
                          <Shield className={`h-3 w-3 ${isFull ? 'text-muted-foreground' : 'text-blue-500'}`} />
                          <span>{acc.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({acc.active_projects}/{acc.max_projects})
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {accounts.length === 0 && (
                <p className="text-xs text-destructive">Nenhuma conta cadastrada nas configurações.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenantLabel">Nome da Entidade</Label>
              <Input
                id="tenantLabel"
                placeholder="Ex: Sindicato dos Pesca"
                value={tenantLabel}
                onChange={(e) => setTenantLabel(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenantCode">Código Único (Subdomínio)</Label>
              <Input
                id="tenantCode"
                placeholder="Ex: sinpesca-oeiras"
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectRef">Project Reference ID do Supabase</Label>
              <Input
                id="projectRef"
                placeholder="Ex: vdwupmfpfkaempsiqfgb"
                value={projectRef}
                onChange={(e) => setProjectRef(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="adminEmail">Email do Administrador Master (Opcional)</Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="Email corporativo da nova entidade"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isStarting || !supabaseAccountId}>
                {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!isStarting && <Play className="mr-2 h-4 w-4" />}
                Iniciar Automação
              </Button>
            </div>
          </form>
        )}

        {jobId && job && (
          <div className="space-y-6 pt-4 text-center">
            {job.status === 'completed' && (
              <div className="flex flex-col items-center text-green-500 mb-4">
                <Check className="h-12 w-12" />
                <h3 className="mt-2 text-xl font-medium">Cliente Onboarded!</h3>
              </div>
            )}

            {job.status === 'failed' && (
              <div className="flex flex-col items-center text-red-500 mb-4">
                <X className="h-12 w-12" />
                <h3 className="mt-2 text-xl font-medium">Erro na execução</h3>
              </div>
            )}

            {job.status !== 'completed' && job.status !== 'failed' && !isError && (
              <div className="flex flex-col items-center text-primary mb-4 animate-pulse">
                <Loader2 className="h-12 w-12 animate-spin" />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between text-sm mb-1 px-1">
                <span>{currentStatusMsg}</span>
                <span className="font-mono text-muted-foreground">{job.current_step}/{job.total_steps}</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>

            {job.error_detail && (
              <div className="text-sm bg-destructive/10 text-destructive p-3 rounded text-left overflow-auto max-h-32">
                <p className="font-semibold mb-1">Falha Técnica:</p>
                <code className="text-xs break-all">{job.error_detail}</code>
              </div>
            )}

            {job.status === 'completed' && (
              <Button onClick={handleClose} className="mt-6 w-full">
                Finalizar e Ver Cliente
              </Button>
            )}

            {job.status === 'failed' && (
              <div className="flex flex-col gap-3 mt-6">
                <Button onClick={() => handleStart()} className="w-full">
                  <Play className="mr-2 h-4 w-4" />
                  Tentar Novamente
                </Button>
                <Button onClick={handleReturnToForm} variant="outline" className="w-full">
                  <X className="mr-2 h-4 w-4" />
                  Voltar e Corrigir Dados
                </Button>
                <Button onClick={handleClose} variant="ghost" className="w-full text-muted-foreground">
                  Cancelar e Fechar
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
