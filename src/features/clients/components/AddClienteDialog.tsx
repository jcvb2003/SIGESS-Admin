import { useState } from "react";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { createSharedTenantForProject } from "@/services/runtime-tenants.service";
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
import type { Project } from "../types";
import { useCreateCliente } from "../hooks/useClienteMutations";

interface AddClienteDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (clienteId: string) => void;
}

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

  const [form, setForm] = useState({
    nome_entidade:  "",
    nome_abreviado: "",
    tenant_code:    "",
    email:          "",
    cnpj_cpf:       "",
    assinatura:     "trial" as "trial" | "monthly" | "annual",
    acesso_expira_em: "",
    max_socios:     "0",
    supports_units: false,
  });

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const showSupportsUnits = project.topology === "shared_hybrid";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome_entidade.trim() || !form.tenant_code.trim()) return;

    const isSharedTopology = project.topology.startsWith("shared");
    const clienteSupportsUnits = showSupportsUnits
      ? form.supports_units
      : ["isolated_polo", "shared_multi_polo", "shared_hybrid"].includes(project.topology);

    try {
      // Passo 1: criar registro central
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

      // Passo 2: criar tenant runtime (só em shared — em isolated já existe via onboarding)
      if (isSharedTopology) {
        try {
          await createSharedTenantForProject(result.id, {
            name: result.nome_entidade,
            code: result.tenant_code,
          });
        } catch (runtimeError) {
          // Runtime falhou, mas registro central foi criado.
          // O link pode ser refeito via Bloco 5 (get-runtime-tenant-id proxy action).
          toast.warning(
            `Tenant criado, mas o vínculo runtime não foi inicializado: ${
              runtimeError instanceof Error ? runtimeError.message : "erro desconhecido"
            }. Acesse o projeto para resolver.`,
          );
          onCreated?.(result.id);
          onOpenChange(false);
          return;
        }
      }

      toast.success(`Tenant "${result.nome_entidade}" criado com sucesso.`);
      onCreated?.(result.id);
      onOpenChange(false);
      setForm({
        nome_entidade: "", nome_abreviado: "", tenant_code: "",
        email: "", cnpj_cpf: "", assinatura: "trial",
        acesso_expira_em: "", max_socios: "0", supports_units: false,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar tenant.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Novo Tenant
          </DialogTitle>
          <DialogDescription>
            Adiciona um tenant ao projeto <strong>{project.project_name}</strong>.
          </DialogDescription>
          {!project.topology.startsWith("shared") && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Projeto isolado — o vínculo com o tenant runtime será preenchido
                automaticamente na próxima verificação de saúde do projeto.
              </p>
            </div>
          )}
        </DialogHeader>

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
                  <p className="text-[11px] text-muted-foreground">
                    Relevante pois o projeto é híbrido.
                  </p>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createCliente.isPending}>
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
      </DialogContent>
    </Dialog>
  );
}
