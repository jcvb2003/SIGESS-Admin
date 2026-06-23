import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cliente, Project } from "../types";
import { useUpdateCliente, useDeleteCliente } from "../hooks/useClienteMutations";
import { syncIsolatedProjectLicense, syncSharedTenantLicense } from "@/services/runtime-tenants.service";
import { tenantCodeExists } from "@/services/commercial-tenants.service";

interface EditClienteModalProps {
  readonly cliente: Cliente;
  readonly project: Project;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: (updated: Cliente) => void;
  readonly onDeleted?: () => void;
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

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function isoToDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function EditClienteModal({
  cliente,
  project,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: EditClienteModalProps) {
  const showSupportsUnits = project.topology === "shared_hybrid";

  const [form, setForm] = useState({
    nome_entidade:    cliente.nome_entidade,
    nome_abreviado:   cliente.nome_abreviado ?? "",
    tenant_code:      cliente.tenant_code,
    email:            cliente.email ?? "",
    telefone:         cliente.telefone ?? "",
    cnpj_cpf:         cliente.cnpj_cpf ?? "",
    logo_url:         cliente.logo_url ?? "",
    assinatura:       cliente.assinatura,
    acesso_expira_em: isoToDate(cliente.acesso_expira_em),
    max_socios:       String(cliente.max_socios ?? 0),
    status:           cliente.status,
    supports_units:   cliente.supports_units,
  });

  const updateCliente = useUpdateCliente(project.id);
  const deleteCliente = useDeleteCliente(project.id);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        nome_entidade:    cliente.nome_entidade,
        nome_abreviado:   cliente.nome_abreviado ?? "",
        tenant_code:      cliente.tenant_code,
        email:            cliente.email ?? "",
        telefone:         cliente.telefone ?? "",
        cnpj_cpf:         cliente.cnpj_cpf ?? "",
        logo_url:         cliente.logo_url ?? "",
        assinatura:       cliente.assinatura,
        acesso_expira_em: isoToDate(cliente.acesso_expira_em),
        max_socios:       String(cliente.max_socios ?? 0),
        status:           cliente.status,
        supports_units:   cliente.supports_units,
      });
      setDeleteConfirm(false);
    }
  }, [open, cliente]);

  const update = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    const normalizedTenantCode = form.tenant_code.trim().toLowerCase();

    try {
      const codeAlreadyExists = await tenantCodeExists(normalizedTenantCode, cliente.id);
      if (codeAlreadyExists) {
        toast.error(`O código de tenant "${normalizedTenantCode}" já está em uso. Escolha outro.`);
        return;
      }

      const result = await updateCliente.mutateAsync({
        id: cliente.id,
        input: {
          nome_entidade:    form.nome_entidade.trim(),
          nome_abreviado:   form.nome_abreviado.trim() || null,
          tenant_code:      normalizedTenantCode,
          email:            form.email.trim() || null,
          telefone:         form.telefone.trim() || null,
          cnpj_cpf:         form.cnpj_cpf.trim() || null,
          logo_url:         form.logo_url.trim() || null,
          assinatura:       form.assinatura,
          acesso_expira_em: form.acesso_expira_em ? form.acesso_expira_em + "T23:59:59.999Z" : null,
          max_socios:       parseInt(form.max_socios, 10) || 0,
          status:           form.status,
          supports_units:   showSupportsUnits ? form.supports_units : cliente.supports_units,
        },
      });
      if (project.topology.startsWith("shared")) {
        if (result.runtime_tenant_id) {
          await syncSharedTenantLicense(project, result.runtime_tenant_id, {
            acesso_expira_em: result.acesso_expira_em,
            max_socios: result.max_socios,
          });
        }
      } else {
        await syncIsolatedProjectLicense(project.id, {
          acesso_expira_em: result.acesso_expira_em,
          max_socios: result.max_socios,
        });
      }
      toast.success("Tenant atualizado com sucesso");
      onUpdated?.(result);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    try {
      await deleteCliente.mutateAsync(cliente.id);
      onDeleted?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(`Erro ao excluir: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Tenant</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <SectionBox title="Identidade">
            <FieldRow label="Nome da Entidade">
              <Input
                value={form.nome_entidade}
                onChange={(e) => update("nome_entidade", e.target.value)}
              />
            </FieldRow>

            <FieldRow label="Nome Abreviado" hint="Exibido no header do Portal do Gestor.">
              <Input
                value={form.nome_abreviado}
                onChange={(e) => update("nome_abreviado", e.target.value)}
                placeholder="Ex: SINPESCA"
              />
            </FieldRow>

            <FieldRow
              label="Código do Tenant"
              hint="Globalmente único. Apenas letras minúsculas, números e hífen."
            >
              <Input
                value={form.tenant_code}
                onChange={(e) => update("tenant_code", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                className="font-mono"
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="contato@entidade.com"
                />
              </FieldRow>
              <FieldRow label="Telefone">
                <Input
                  value={form.telefone}
                  onChange={(e) => update("telefone", e.target.value)}
                  placeholder="(xx) xxxxx-xxxx"
                />
              </FieldRow>
            </div>

            <FieldRow label="CNPJ / CPF">
              <Input
                value={form.cnpj_cpf}
                onChange={(e) => update("cnpj_cpf", e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </FieldRow>

            <FieldRow label="URL do Logo">
              <Input
                value={form.logo_url}
                onChange={(e) => update("logo_url", e.target.value)}
                placeholder="https://..."
              />
              {form.logo_url ? (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={form.logo_url}
                    alt="preview"
                    className="h-10 w-10 rounded-lg object-cover border border-border/50"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="text-[11px] text-muted-foreground">Preview</span>
                </div>
              ) : (
                <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-border/50">
                  <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </FieldRow>

            {showSupportsUnits && (
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">Este tenant tem polos?</p>
                  <p className="text-[11px] text-muted-foreground">Projeto híbrido — define disponibilidade de polos.</p>
                </div>
                <Switch
                  checked={form.supports_units}
                  onCheckedChange={(v) => update("supports_units", v)}
                />
              </div>
            )}
          </SectionBox>

          <SectionBox title="Contrato">
            <div className="grid grid-cols-2 gap-3">
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
              <FieldRow label="Status Operacional">
                <Select value={form.status} onValueChange={(v) => update("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="suspended">Suspenso</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>

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
                  value={form.max_socios}
                  onChange={(e) => update("max_socios", e.target.value)}
                />
              </FieldRow>
            </div>
          </SectionBox>

          <div className="space-y-3 pt-1">
            <Separator />
            <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-destructive">Excluir tenant</p>
                <p className="text-xs text-muted-foreground">Remove permanentemente do Admin.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                onClick={handleDelete}
                disabled={deleteCliente.isPending}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                {deleteConfirm ? "Confirmar exclusão" : "Excluir"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={
              updateCliente.isPending ||
              !form.nome_entidade.trim() ||
              !form.tenant_code.trim()
            }
          >
            {updateCliente.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
