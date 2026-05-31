import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Client } from "../types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { useUpdateClient, useDeleteClient } from "../hooks/index";
import { DeleteClientDialog } from "./DeleteClientDialog";

interface EditClientModalProps {
  readonly client: Client;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: (updated: Client) => void;
  readonly onDeleted?: () => void;
}

export function EditClientModal({
  client,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: EditClientModalProps) {
  const [form, setForm] = useState({
    nome_entidade: client.nome_entidade,
    tenant_code: client.tenant_code,
    deployment_mode: client.deployment_mode,
    shared_mode: client.shared_mode ?? "",
    shared_project_ref: client.shared_project_ref || "",
    shared_tenant_id: client.shared_tenant_id || "",
    email: client.email || "",
    telefone: client.telefone || "",
    supabase_url: client.supabase_url,
    supabase_publishable_key: client.supabase_publishable_key,
    supabase_secret_keys: "",
    supabase_access_token: "",
    logo_url: client.logo_url || "",
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const updateClientMutation = useUpdateClient();
  const deleteClientMutation = useDeleteClient();

  useEffect(() => {
    if (open) {
      setForm({
        nome_entidade: client.nome_entidade,
        tenant_code: client.tenant_code,
        deployment_mode: client.deployment_mode,
        shared_mode: client.shared_mode ?? "",
        shared_project_ref: client.shared_project_ref || "",
        shared_tenant_id: client.shared_tenant_id || "",
        email: client.email || "",
        telefone: client.telefone || "",
        supabase_url: client.supabase_url,
        supabase_publishable_key: client.supabase_publishable_key,
        supabase_secret_keys: "",
        supabase_access_token: "",
        logo_url: client.logo_url || "",
      });
    }
  }, [open, client]);

  const handleSave = async () => {
    try {
      const updatePayload: Record<string, unknown> = {
        nome_entidade: form.nome_entidade,
        tenant_code: form.tenant_code.trim().toLowerCase(),
        deployment_mode: form.deployment_mode,
        shared_mode: form.shared_mode || null,
        shared_project_ref: form.shared_project_ref.trim() || null,
        shared_tenant_id: form.shared_tenant_id.trim() || null,
        email: form.email || null,
        telefone: form.telefone || null,
        supabase_url: form.supabase_url,
        supabase_publishable_key: form.supabase_publishable_key,
        logo_url: form.logo_url || null,
      };

      if (form.supabase_secret_keys) {
        updatePayload.supabase_secret_keys = form.supabase_secret_keys;
      }
      if (form.supabase_access_token) {
        updatePayload.supabase_access_token = form.supabase_access_token;
      }

      const result = await updateClientMutation.mutateAsync({
        id: client.id,
        input: updatePayload,
      });

      toast.success("Cliente atualizado com sucesso");
      if (onUpdated) onUpdated(result);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        `Erro ao salvar: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
      );
    }
  };

  const handleConfirmDelete = async () => {
    await deleteClientMutation.mutateAsync(client.id);
    onOpenChange(false);
    onDeleted?.();
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div>
              <Label>Nome da Entidade *</Label>
              <Input value={form.nome_entidade} onChange={(e) => update("nome_entidade", e.target.value)} />
            </div>
            <div>
              <Label>Tenant Code *</Label>
              <Input
                value={form.tenant_code}
                onChange={(e) => update("tenant_code", e.target.value)}
                placeholder="ex: z2, sinpesca-breves"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Identificador público e crítico para resolução dinâmica no Web. Use apenas letras minúsculas, números e hífen.
              </p>
            </div>
            <div>
              <Label>Modo de Implantação</Label>
              <Select value={form.deployment_mode} onValueChange={(v) => update("deployment_mode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="isolated">Isolated</SelectItem>
                  <SelectItem value="shared">Shared</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.deployment_mode === "shared" && (
              <div>
                <Label>Modo Shared</Label>
                <Select value={form.shared_mode} onValueChange={(v) => update("shared_mode", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o modo shared" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="polo">polo — 1 tenant, N polos</SelectItem>
                    <SelectItem value="multi">multi — N tenants, sem polos</SelectItem>
                    <SelectItem value="multi_polo">multi_polo — N tenants, cada um com polos</SelectItem>
                    <SelectItem value="hybrid">hybrid — N tenants, modo misto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => update("email", e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => update("telefone", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>URL do Supabase *</Label>
              <Input value={form.supabase_url} onChange={(e) => update("supabase_url", e.target.value)} />
            </div>
            <div>
              <Label>Chave Pública (Publishable)</Label>
              <Input value={form.supabase_publishable_key} onChange={(e) => update("supabase_publishable_key", e.target.value)} />
            </div>
            <div>
              <Label>Shared Project Ref</Label>
              <Input value={form.shared_project_ref} onChange={(e) => update("shared_project_ref", e.target.value)} placeholder="Ex: jmahgvgtjstklabwkkit" />
            </div>
            <div>
              <Label>Shared Tenant ID</Label>
              <Input value={form.shared_tenant_id} onChange={(e) => update("shared_tenant_id", e.target.value)} placeholder="UUID do tenant no banco shared" />
            </div>
            <div>
              <Label>Chave Secreta (Service Role)</Label>
              <Input type="password" value={form.supabase_secret_keys} placeholder="Deixe em branco para não alterar" onChange={(e) => update("supabase_secret_keys", e.target.value)} />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Supabase Access Token (PAT)
                <span className="text-[10px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold uppercase">
                  Acesso Conta Completa
                </span>
              </Label>
              <Input type="password" placeholder="sbp_... (Deixe em branco para não alterar)" value={form.supabase_access_token} onChange={(e) => update("supabase_access_token", e.target.value)} />
            </div>
            <div>
              <Label>URL do Logo</Label>
              <Input value={form.logo_url} onChange={(e) => update("logo_url", e.target.value)} />
            </div>

            {/* Zona de perigo */}
            <div className="space-y-3 pt-2">
              <Separator />
              <div className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-destructive">Excluir cliente</p>
                  <p className="text-xs text-muted-foreground">Remove permanentemente todos os dados do Admin.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Excluir
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                updateClientMutation.isPending ||
                !form.nome_entidade ||
                !form.tenant_code.trim() ||
                !form.supabase_url ||
                !form.supabase_publishable_key.trim() ||
                (form.deployment_mode === "shared" && !form.shared_project_ref.trim())
              }
            >
              {updateClientMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteClientDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        clientName={client.nome_entidade}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
