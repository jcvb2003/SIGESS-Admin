import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ClienteComProjeto, Topology } from "../types";
import { TOPOLOGY_LABEL } from "../types";
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
import { ChevronDown, ImageIcon, KeyRound, Trash2 } from "lucide-react";
import { useUpdateClient, useDeleteClient } from "../hooks/index";
import { updateProject } from "@/services/projects.service";
import { DeleteClientDialog } from "./DeleteClientDialog";

interface EditClientModalProps {
  readonly client: ClienteComProjeto;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: () => void;
  readonly onDeleted?: () => void;
}

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
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

export function EditClientModal({
  client,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
}: EditClientModalProps) {
  const [form, setForm] = useState({
    // campos de clientes
    nome_entidade: client.nome_entidade,
    nome_abreviado: client.nome_abreviado || "",
    tenant_code: client.tenant_code,
    email: client.email || "",
    telefone: client.telefone || "",
    logo_url: client.logo_url || "",
    // campos de projetos
    topology: client.projetos.topology as Topology,
    supabase_url: client.projetos.supabase_url,
    supabase_publishable_key: client.projetos.supabase_publishable_key,
    supabase_secret_keys: "",
    supabase_access_token: "",
  });

  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const updateClienteMutation = useUpdateClient();
  const deleteClientMutation = useDeleteClient();

  useEffect(() => {
    if (open) {
      setForm({
        nome_entidade: client.nome_entidade,
        nome_abreviado: client.nome_abreviado || "",
        tenant_code: client.tenant_code,
        email: client.email || "",
        telefone: client.telefone || "",
        logo_url: client.logo_url || "",
        topology: client.projetos.topology as Topology,
        supabase_url: client.projetos.supabase_url,
        supabase_publishable_key: client.projetos.supabase_publishable_key,
        supabase_secret_keys: "",
        supabase_access_token: "",
      });
      setCredentialsOpen(false);
    }
  }, [open, client]);

  const handleSave = async () => {
    try {
      // Atualiza campos comerciais em clientes
      await updateClienteMutation.mutateAsync({
        id: client.id,
        input: {
          nome_entidade: form.nome_entidade,
          nome_abreviado: form.nome_abreviado.trim() || null,
          tenant_code: form.tenant_code.trim().toLowerCase(),
          email: form.email || null,
          telefone: form.telefone || null,
          logo_url: form.logo_url || null,
        },
      });

      // Atualiza campos de infra em projetos
      const projetoUpdate: Record<string, unknown> = {
        topology: form.topology,
        supabase_url: form.supabase_url,
        supabase_publishable_key: form.supabase_publishable_key,
        tenant_code: form.tenant_code.trim().toLowerCase(),
      };
      if (form.supabase_secret_keys) projetoUpdate.supabase_secret_keys = form.supabase_secret_keys;
      if (form.supabase_access_token) projetoUpdate.supabase_access_token = form.supabase_access_token;

      await updateProject(client.project_id, projetoUpdate);

      toast.success("Cliente atualizado com sucesso");
      onUpdated?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
  };

  const handleConfirmDelete = async () => {
    await deleteClientMutation.mutateAsync(client.project_id);
    onOpenChange(false);
    onDeleted?.();
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isSaving = updateClienteMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-1">

            {/* ── Identidade ── */}
            <SectionBox title="Identidade">
              <FieldRow label="Nome da Entidade">
                <Input
                  value={form.nome_entidade}
                  onChange={(e) => update("nome_entidade", e.target.value)}
                />
              </FieldRow>

              <FieldRow
                label="Nome Abreviado"
                hint="Exibido no header do Portal do Gestor quando não há polo ativo."
              >
                <Input
                  value={form.nome_abreviado}
                  onChange={(e) => update("nome_abreviado", e.target.value)}
                  placeholder="ex: SINPESCA"
                />
              </FieldRow>

              <FieldRow
                label="Código do Tenant"
                hint="Identificador público crítico para resolução dinâmica no Web. Apenas letras minúsculas, números e hífen."
              >
                <Input
                  value={form.tenant_code}
                  onChange={(e) => update("tenant_code", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="ex: sinpesca-oeiras"
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
            </SectionBox>

            {/* ── Infraestrutura ── */}
            <SectionBox title="Infraestrutura">
              <FieldRow label="Topologia">
                <Select value={form.topology} onValueChange={(v) => update("topology", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(TOPOLOGY_LABEL) as [Topology, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="URL do Supabase">
                <Input
                  value={form.supabase_url}
                  onChange={(e) => update("supabase_url", e.target.value)}
                  placeholder="https://xxx.supabase.co"
                  className="font-mono text-sm"
                />
              </FieldRow>

              <FieldRow label="Chave Pública (anon)">
                <Input
                  value={form.supabase_publishable_key}
                  onChange={(e) => update("supabase_publishable_key", e.target.value)}
                  className="font-mono text-sm"
                />
              </FieldRow>
            </SectionBox>

            {/* ── Credenciais ── */}
            <div className="rounded-lg border border-border/50">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setCredentialsOpen((v) => !v)}
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Credenciais Sensíveis
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Deixe em branco para manter o valor atual
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${credentialsOpen ? "rotate-180" : ""}`}
                />
              </button>

              {credentialsOpen && (
                <div className="space-y-3 border-t border-border/50 bg-secondary/20 px-4 pb-4 pt-3">
                  <FieldRow label="Chave Secreta (service_role)">
                    <Input
                      type="password"
                      value={form.supabase_secret_keys}
                      onChange={(e) => update("supabase_secret_keys", e.target.value)}
                      placeholder="eyJ... (em branco = mantém o valor atual)"
                    />
                  </FieldRow>

                  <FieldRow label="Access Token (PAT)">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-500">
                        Acesso Total à Conta
                      </span>
                    </div>
                    <Input
                      type="password"
                      value={form.supabase_access_token}
                      onChange={(e) => update("supabase_access_token", e.target.value)}
                      placeholder="sbp_... (em branco = mantém o valor atual)"
                    />
                  </FieldRow>
                </div>
              )}
            </div>

            {/* ── Zona de perigo ── */}
            <div className="space-y-3 pt-1">
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
              disabled={isSaving || !form.nome_entidade || !form.tenant_code.trim() || !form.supabase_url || !form.supabase_publishable_key.trim()}
            >
              {isSaving ? "Salvando..." : "Salvar"}
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
