import { useState, useEffect } from "react";
import type { Client } from "../types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateClient } from "../hooks/index";

interface EditClientModalProps {
  readonly client: Client;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: (updated: Client) => void;
}

export function EditClientModal({ client, open, onOpenChange, onUpdated }: EditClientModalProps) {
  const [form, setForm] = useState({
    nome_entidade: client.nome_entidade,
    tenant_code: client.tenant_code,
    email: client.email || "",
    telefone: client.telefone || "",
    supabase_url: client.supabase_url,
    supabase_publishable_key: client.supabase_publishable_key,
    supabase_secret_keys: "",
    supabase_access_token: "",
    logo_url: client.logo_url || "",
  });
  
  const updateClientMutation = useUpdateClient();

  useEffect(() => {
    if (open) {
      setForm({
        nome_entidade: client.nome_entidade,
        tenant_code: client.tenant_code,
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
          <div>
            <Label>Tenant Code *</Label>
            <Input
              value={form.tenant_code}
              onChange={e => update("tenant_code", e.target.value)}
              placeholder="ex: z2, sinpesca-breves"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Identificador publico e critico para resolucao dinamica no Web. Use apenas letras minusculas, numeros e hifen.
            </p>
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
            <Input type="password" value={form.supabase_secret_keys} placeholder="Deixe em branco para não alterar" onChange={e => update("supabase_secret_keys", e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              Supabase Access Token (PAT) <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold uppercase">Acesso Conta Completa</span>
            </Label>
            <Input 
              type="password" 
              placeholder="sbp_... (Deixe em branco para não alterar)" 
              value={form.supabase_access_token} 
              onChange={e => update("supabase_access_token", e.target.value)} 
            />
          </div>
          <div>
            <Label>URL do Logo</Label>
            <Input value={form.logo_url} onChange={e => update("logo_url", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={
                updateClientMutation.isPending ||
                !form.nome_entidade ||
                !form.tenant_code.trim() ||
                !form.supabase_url ||
                !form.supabase_publishable_key.trim()
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
