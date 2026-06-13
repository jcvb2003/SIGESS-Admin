import { useState } from "react";
import { CheckCircle2, Link, Loader2, UserPlus, AlertCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import {
  createSharedTenantForProject,
  linkIsolatedProjectRuntime,
  syncIsolatedProjectLicense,
} from "@/services/runtime-tenants.service";
import { deleteTenant } from "@/services/commercial-tenants.service";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cliente, Project } from "../types";
import { useCreateCliente, useUpdateCliente } from "../hooks/useClienteMutations";

interface AddClienteDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (clienteId: string) => void;
}

type Step = "form" | "linking" | "confirm-link" | "link-error";

const INITIAL_FORM = {
  nome_entidade:    "",
  nome_abreviado:   "",
  tenant_code:      "",
  email:            "",
  cnpj_cpf:         "",
  assinatura:       "trial" as "trial" | "monthly" | "annual",
  acesso_expira_em: "",
  max_socios:       "0",
  supports_units:   false,
};

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AddClienteDialog({ project, open, onOpenChange, onCreated }: Readonly<AddClienteDialogProps>) {
  const createCliente = useCreateCliente(project.id);
  const updateCliente = useUpdateCliente(project.id);

  const [form, setForm]                       = useState(INITIAL_FORM);
  const [step, setStep]                       = useState<Step>("form");
  const [createdCliente, setCreatedCliente]   = useState<Cliente | null>(null);
  const [foundRuntimeId, setFoundRuntimeId]   = useState<string | null>(null);
  const [linkError, setLinkError]             = useState<string | null>(null);
  const [isConfirming, setIsConfirming]       = useState(false);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isIsolated     = !project.topology.startsWith("shared");
  const showSupportsUnits = project.topology === "shared_hybrid";

  const reset = () => {
    setForm(INITIAL_FORM);
    setStep("form");
    setCreatedCliente(null);
    setFoundRuntimeId(null);
    setLinkError(null);
    setIsConfirming(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome_entidade.trim() || !form.tenant_code.trim()) return;

    const clienteSupportsUnits = showSupportsUnits
      ? form.supports_units
      : ["isolated_polo", "shared_multi_polo", "shared_hybrid"].includes(project.topology);

    try {
      const result = await createCliente.mutateAsync({
        nome_entidade:     form.nome_entidade.trim(),
        nome_abreviado:    form.nome_abreviado.trim() || null,
        tenant_code:       form.tenant_code.trim().toLowerCase(),
        runtime_tenant_id: null,
        supports_units:    clienteSupportsUnits,
        email:             form.email.trim() || null,
        telefone:          null,
        cnpj_cpf:          form.cnpj_cpf.trim() || null,
        logo_url:          null,
        assinatura:        form.assinatura,
        acesso_expira_em:  form.acesso_expira_em ? form.acesso_expira_em + "T23:59:59.999Z" : null,
        max_socios:        parseInt(form.max_socios, 10) || 0,
        status:            "active",
      });

      setCreatedCliente(result);

      // Shared: cria tenant runtime diretamente
      if (!isIsolated) {
        try {
          await createSharedTenantForProject(project, result.id, {
            name: result.nome_entidade,
            code: result.tenant_code,
            acesso_expira_em: result.acesso_expira_em,
            max_socios: result.max_socios,
          });
          toast.success(`Tenant "${result.nome_entidade}" criado com sucesso.`);
          onCreated?.(result.id);
          handleClose();
        } catch (runtimeError) {
          try {
            await deleteTenant(result.id);
          } catch (rollbackError) {
            toast.error(
              `Falha ao criar tenant no runtime e o rollback do registro central também falhou: ${
                rollbackError instanceof Error ? rollbackError.message : "erro desconhecido"
              }. Erro original: ${runtimeError instanceof Error ? runtimeError.message : "erro desconhecido"}`,
            );
            return;
          }

          toast.error(
            `Falha ao criar tenant no runtime: ${
              runtimeError instanceof Error ? runtimeError.message : "erro desconhecido"
            }. O registro central foi removido automaticamente.`,
          );
        }
        return;
      }

      // Isolated: descoberta explícita do runtime tenant
      setStep("linking");
      try {
        const { runtime_tenant_id, runtime_tenants_count, runtime_topology } = await linkIsolatedProjectRuntime(project.id);
        if (!runtime_tenant_id) {
          setLinkError(
            runtime_tenants_count === 0
              ? "Nenhum tenant runtime foi encontrado neste projeto."
              : `O runtime retornou ${runtime_tenants_count} tenants (${runtime_topology ?? "topologia desconhecida"}). O vinculo isolated exige exatamente 1 tenant.`,
          );
          setStep("link-error");
          return;
        }
        setFoundRuntimeId(runtime_tenant_id);
        setStep("confirm-link");
      } catch (err) {
        setLinkError(err instanceof Error ? err.message : "Não foi possível consultar o banco runtime.");
        setStep("link-error");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar tenant.");
    }
  };

  const handleConfirmLink = async () => {
    if (!createdCliente || !foundRuntimeId) return;
    setIsConfirming(true);
    try {
      await updateCliente.mutateAsync({
        id: createdCliente.id,
        input: { runtime_tenant_id: foundRuntimeId },
      });
      await syncIsolatedProjectLicense(project.id, {
        acesso_expira_em: createdCliente.acesso_expira_em,
        max_socios: createdCliente.max_socios,
      });
      toast.success(`Tenant "${createdCliente.nome_entidade}" vinculado ao runtime com sucesso.`);
      onCreated?.(createdCliente.id);
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gravar o vínculo.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSkipLink = () => {
    if (!createdCliente) return;
    toast.warning("Tenant criado sem vínculo runtime. Resolva depois pelo painel do projeto.");
    onCreated?.(createdCliente.id);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Novo Tenant
          </DialogTitle>
          <DialogDescription>
            Adiciona um tenant ao projeto <strong>{project.project_name}</strong>.
          </DialogDescription>
          {isIsolated && step === "form" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Projeto isolado — após criar o registro, você será solicitado a confirmar
                o vínculo com o tenant runtime existente no banco.
              </p>
            </div>
          )}
        </DialogHeader>

        {/* ── PASSO 1: Formulário ── */}
        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2 overflow-y-auto flex-1 pr-1">
            <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identidade</p>

              <FieldRow label="Nome da Entidade">
                <Input
                  placeholder="Ex: Sindicato dos Pescadores de Breves"
                  value={form.nome_entidade}
                  onChange={(e) => update("nome_entidade", e.target.value)}
                  required
                />
              </FieldRow>

              <FieldRow label="Nome Abreviado" hint="Exibido no header do Portal do Gestor.">
                <Input
                  placeholder="Ex: SINPESCA"
                  value={form.nome_abreviado}
                  onChange={(e) => update("nome_abreviado", e.target.value)}
                />
              </FieldRow>

              <FieldRow
                label="Código do Tenant"
                hint="Globalmente único. Apenas letras minúsculas, números e hífen."
              >
                <Input
                  placeholder="Ex: sinpesca-breves"
                  value={form.tenant_code}
                  onChange={(e) => update("tenant_code", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="font-mono"
                  required
                />
              </FieldRow>

              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Email">
                  <Input
                    type="email"
                    placeholder="contato@entidade.com"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="CNPJ / CPF">
                  <Input
                    placeholder="00.000.000/0001-00"
                    value={form.cnpj_cpf}
                    onChange={(e) => update("cnpj_cpf", e.target.value)}
                  />
                </FieldRow>
              </div>

              {showSupportsUnits && (
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">Este tenant tem polos?</p>
                    <p className="text-[11px] text-muted-foreground">Relevante pois o projeto é híbrido.</p>
                  </div>
                  <Switch
                    checked={form.supports_units}
                    onCheckedChange={(v) => update("supports_units", v)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contrato</p>

              <FieldRow label="Plano">
                <Select value={form.assinatura} onValueChange={(v) => update("assinatura", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Acesso expira em">
                  <Input
                    type="date"
                    value={form.acesso_expira_em}
                    onChange={(e) => update("acesso_expira_em", e.target.value)}
                  />
                </FieldRow>
                <FieldRow label="Limite de Sócios" hint="0 = bloqueia acesso imediatamente">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.max_socios}
                    onChange={(e) => update("max_socios", e.target.value)}
                  />
                </FieldRow>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleClose} disabled={createCliente.isPending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createCliente.isPending || !form.nome_entidade.trim() || !form.tenant_code.trim()}
              >
                {createCliente.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <UserPlus className="mr-2 h-4 w-4" />}
                Criar Tenant
              </Button>
            </div>
          </form>
        )}

        {/* ── PASSO 2a: Consultando runtime ── */}
        {step === "linking" && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-9 w-9 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Consultando tenant runtime do projeto…
            </p>
          </div>
        )}

        {/* ── PASSO 2b: Confirmar vínculo ── */}
        {step === "confirm-link" && foundRuntimeId && (
          <div className="space-y-5 pt-2">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Tenant runtime encontrado
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Encontramos 1 tenant no banco deste projeto.
                  Deseja vinculá-lo a <strong>{createdCliente?.nome_entidade}</strong>?
                </p>
              </div>
              <code className="rounded bg-secondary px-3 py-1.5 text-[11px] font-mono text-muted-foreground break-all">
                {foundRuntimeId}
              </code>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleConfirmLink} disabled={isConfirming} className="w-full">
                {isConfirming
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Link className="mr-2 h-4 w-4" />}
                Vincular e concluir
              </Button>
              <Button
                variant="ghost"
                onClick={handleSkipLink}
                disabled={isConfirming}
                className="w-full text-muted-foreground"
              >
                <SkipForward className="mr-2 h-4 w-4" />
                Pular — resolver depois
              </Button>
            </div>
          </div>
        )}

        {/* ── PASSO 2c: Erro na descoberta ── */}
        {step === "link-error" && (
          <div className="space-y-5 pt-2">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 text-center">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Não foi possível descobrir o tenant runtime
                </p>
                {linkError && (
                  <p className="mt-1 text-[11px] text-muted-foreground">{linkError}</p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  O cadastro comercial foi criado com sucesso.
                  O vínculo operacional com o tenant runtime está pendente
                  e pode ser resolvido pelo painel do projeto.
                </p>
              </div>
            </div>
            <Button onClick={handleSkipLink} className="w-full">
              Entendido — fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
