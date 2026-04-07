import { useState, useEffect } from "react";
import type { Client } from "../types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateClient } from "../hooks/index";
import { proxyAction } from "@/services/clients.service";

interface EditClientModalProps {
  readonly client: Client;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: (updated: Client) => void;
}

export function EditClientModal({ client, open, onOpenChange, onUpdated }: EditClientModalProps) {
  const formatForInput = (isoString: string | null) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      if (Number.isNaN(date.getTime())) return "";
      const pad = (n: number) => n.toString().padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } catch {
      return "";
    }
  };

  const [form, setForm] = useState({
    nome_entidade: client.nome_entidade,
    email: client.email || "",
    telefone: client.telefone || "",
    supabase_url: client.supabase_url,
    supabase_publishable_key: client.supabase_publishable_key || "",
    supabase_secret_keys: client.supabase_secret_keys || "",
    supabase_access_token: client.supabase_access_token || "",
    logo_url: client.logo_url || "",
    assinatura: client.assinatura,
    acesso_expira_em: formatForInput(client.acesso_expira_em),
    max_socios: client.max_socios ?? 5,
  });
  
  const updateClientMutation = useUpdateClient();

  useEffect(() => {
    if (open) {
      setForm({
        nome_entidade: client.nome_entidade,
        email: client.email || "",
        telefone: client.telefone || "",
        supabase_url: client.supabase_url,
        supabase_publishable_key: client.supabase_publishable_key || "",
        supabase_secret_keys: client.supabase_secret_keys || "",
        supabase_access_token: client.supabase_access_token || "",
        logo_url: client.logo_url || "",
        assinatura: client.assinatura,
        acesso_expira_em: formatForInput(client.acesso_expira_em),
        max_socios: client.max_socios ?? 5,
      });
    }
  }, [open, client]);

  const handleSave = async () => {
    try {
      const updatePayload: Record<string, unknown> = {
          nome_entidade: form.nome_entidade,
          email: form.email || null,
          telefone: form.telefone || null,
          supabase_url: form.supabase_url,
          supabase_publishable_key: form.supabase_publishable_key || null,
          logo_url: form.logo_url || null,
          assinatura: form.assinatura,
          acesso_expira_em: (form.assinatura === "trial" || form.assinatura === "anual") && form.acesso_expira_em 
            ? new Date(form.acesso_expira_em).toISOString() 
            : null,
          max_socios: form.assinatura === "trial" ? form.max_socios : null,
        };

        // Only overwrite sensitive keys if user explicitly typed a new value
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
      
      const hasSubscriptionChanges = 
        form.assinatura !== client.assinatura ||
        form.acesso_expira_em !== formatForInput(client.acesso_expira_em) ||
        form.max_socios !== (client.max_socios ?? 5);

      if (hasSubscriptionChanges) {
        try {
          // Gatilho de sincronização automática se houver mudanças na assinatura
          await proxyAction(client.id, "sync-trial-limits");
          toast.success("Cliente atualizado e limites sincronizados!");
        } catch (syncError) {
          toast.error(`Cliente atualizado, mas erro no proxy: ${syncError instanceof Error ? syncError.message : "Erro desconhecido"}`);
        }
      } else {
        toast.success("Cliente atualizado com sucesso");
      }

      if (onUpdated) onUpdated(result);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome da Entidade *</Label>
            <Input value={form.nome_entidade} onChange={e => update("nome_entidade", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={e => update("email", e.target.value)} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={e => update("telefone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>URL do Supabase *</Label>
            <Input value={form.supabase_url} onChange={e => update("supabase_url", e.target.value)} />
          </div>
          <div>
            <Label>Chave Pública (Publishable)</Label>
            <Input value={form.supabase_publishable_key} onChange={e => update("supabase_publishable_key", e.target.value)} />
          </div>
          <div>
            <Label>Chave Secreta (Service Role)</Label>
            <Input type="password" value={form.supabase_secret_keys} onChange={e => update("supabase_secret_keys", e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              Supabase Access Token (PAT) <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold uppercase">Acesso Conta Completa</span>
            </Label>
            <Input 
              type="password" 
              placeholder="sbp_..." 
              value={form.supabase_access_token} 
              onChange={e => update("supabase_access_token", e.target.value)} 
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Necessário para migrações de schema. Este token dá acesso administrativo a TODOS os projetos da conta Supabase do cliente.
            </p>
          </div>
          <div>
            <Label>URL do Logo</Label>
            <Input value={form.logo_url} onChange={e => update("logo_url", e.target.value)} />
          </div>
          <div>
            <Label>Plano de Assinatura</Label>
            <Select value={form.assinatura} onValueChange={v => {
              const value = v as "mensal" | "anual" | "trial";
              let newExpiraEm = form.acesso_expira_em;
              if (value === "anual") {
                const nextYear = new Date();
                nextYear.setFullYear(nextYear.getFullYear() + 1);
                newExpiraEm = formatForInput(nextYear.toISOString());
              }
              setForm(prev => ({ ...prev, assinatura: value, acesso_expira_em: newExpiraEm }));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(form.assinatura === "trial" || form.assinatura === "anual") && (
            <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <p className="text-xs font-semibold text-primary uppercase">
                {form.assinatura === "trial" ? "Configurações do Trial" : "Configurações do Plano Anual"}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data de Expiração</Label>
                  <Input
                    type="datetime-local"
                    value={form.acesso_expira_em}
                    onChange={e => update("acesso_expira_em", e.target.value)}
                  />
                </div>
                {form.assinatura === "trial" && (
                  <div>
                    <Label>Limite de Sócios</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.max_socios}
                      onChange={e => setForm(prev => ({ ...prev, max_socios: Number.parseInt(e.target.value) || 5 }))}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={
                updateClientMutation.isPending || 
                !form.nome_entidade || 
                !form.supabase_url ||
                ((form.assinatura === "trial" || form.assinatura === "anual") && !form.acesso_expira_em)
              }
            >
              {updateClientMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
