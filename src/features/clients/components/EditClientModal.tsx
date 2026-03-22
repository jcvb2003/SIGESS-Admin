import { useState, useEffect } from "react";
import type { Client } from "../types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    email: client.email || "",
    telefone: client.telefone || "",
    supabase_url: client.supabase_url,
    supabase_publishable_key: client.supabase_publishable_key || "",
    supabase_secret_keys: client.supabase_secret_keys || "",
    logo_url: client.logo_url || "",
    assinatura: client.assinatura,
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
        logo_url: client.logo_url || "",
        assinatura: client.assinatura,
      });
    }
  }, [open, client]);

  const handleSave = async () => {
    try {
      const result = await updateClientMutation.mutateAsync({
        id: client.id,
        input: {
          nome_entidade: form.nome_entidade,
          email: form.email || null,
          telefone: form.telefone || null,
          supabase_url: form.supabase_url,
          supabase_publishable_key: form.supabase_publishable_key || null,
          supabase_secret_keys: form.supabase_secret_keys || null,
          logo_url: form.logo_url || null,
          assinatura: form.assinatura,
        }
      });
      
      toast.success("Cliente atualizado com sucesso");
      if (onUpdated) onUpdated(result as Client);
      onOpenChange(false);
    } catch (error) {
      const err = error as Error;
      toast.error(`Erro ao salvar: ${err.message}`);
    }
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
            <Label>URL do Logo</Label>
            <Input value={form.logo_url} onChange={e => update("logo_url", e.target.value)} />
          </div>
          <div>
            <Label>Plano de Assinatura</Label>
            <Select value={form.assinatura} onValueChange={v => update("assinatura", v as "mensal" | "anual")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={updateClientMutation.isPending || !form.nome_entidade || !form.supabase_url}
            >
              {updateClientMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
