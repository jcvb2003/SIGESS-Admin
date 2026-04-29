import { useState, useEffect } from "react";
import type { Client } from "../types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpdateClient } from "../hooks/index";
import { proxyAction } from "@/services/clients.service";
import { CreditCard, Calendar, Users, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SubscriptionModalProps {
  readonly client: Client;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: (updated: Client) => void;
}

export function SubscriptionModal({ client, open, onOpenChange, onUpdated }: SubscriptionModalProps) {
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
    assinatura: client.assinatura,
    acesso_expira_em: formatForInput(client.acesso_expira_em),
    max_socios: client.max_socios ?? 0,
  });
  
  const updateClientMutation = useUpdateClient();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        assinatura: client.assinatura,
        acesso_expira_em: formatForInput(client.acesso_expira_em),
        max_socios: client.max_socios ?? 0,
      });
    }
  }, [open, client]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatePayload = {
        assinatura: form.assinatura,
        acesso_expira_em: form.acesso_expira_em ? new Date(form.acesso_expira_em).toISOString() : null,
        max_socios: Number(form.max_socios) > 0 ? Number(form.max_socios) : null,
      };

      const result = await updateClientMutation.mutateAsync({
        id: client.id,
        input: updatePayload,
      });
      
      try {
        await proxyAction(client.id, "sync-trial-limits", {
          acesso_expira_em: updatePayload.acesso_expira_em,
          max_socios: updatePayload.max_socios
        });
        toast.success("Assinatura atualizada e limites sincronizados!");
      } catch (syncError) {
        toast.error(`Assinatura salva, mas erro ao sincronizar: ${syncError instanceof Error ? syncError.message : "Erro desconhecido"}`);
      }

      if (onUpdated) onUpdated(result);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background border-border/50 shadow-2xl">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Assinatura e Limites
          </DialogTitle>
          <DialogDescription>
            Configure as regras de acesso para <span className="font-semibold text-foreground">{client.nome_entidade}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Rocket className="h-4 w-4 text-primary" />
                Plano
              </Label>
              <Select value={form.assinatura} onValueChange={(v) => update("assinatura", v)}>
                <SelectTrigger className="bg-secondary/30">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="trial">Experimental</SelectItem>
                  <SelectItem value="cortesia">Cortesia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-primary" />
                Expira em
              </Label>
              <Input 
                type="datetime-local" 
                value={form.acesso_expira_em} 
                onChange={e => update("acesso_expira_em", e.target.value)}
                className="bg-secondary/30"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" />
                Limite de Sócios
              </Label>
              <Badge variant="outline" className="bg-background/50">
                {form.max_socios > 0 ? `${form.max_socios} sócios` : "Ilimitado"}
              </Badge>
            </div>
            <Input 
              type="number" 
              placeholder="0 = ilimitado"
              value={form.max_socios || ""} 
              onChange={e => update("max_socios", e.target.value)}
              className="bg-background"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancelar</Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="min-w-[140px]"
            >
              {isSaving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
