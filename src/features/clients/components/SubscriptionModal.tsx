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
import { CreditCard, Calendar, Users, Rocket } from "lucide-react";

interface SubscriptionModalProps {
  readonly client: Client;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: (updated: Client) => void;
}

function isoToDateInput(isoString: string | null): string {
  if (!isoString) return "";
  // Slice the UTC date directly — avoids any local timezone offset shift
  return isoString.slice(0, 10);
}

function dateInputToIso(dateString: string): string {
  // Store as end of day UTC so the date is unambiguous regardless of client timezone
  return dateString + "T23:59:59.999Z";
}

export function SubscriptionModal({ client, open, onOpenChange, onUpdated }: SubscriptionModalProps) {
  const [form, setForm] = useState({
    assinatura: client.assinatura,
    acesso_expira_em: isoToDateInput(client.acesso_expira_em),
    max_socios: client.max_socios ?? 0,
  });

  const updateClientMutation = useUpdateClient();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        assinatura: client.assinatura,
        acesso_expira_em: isoToDateInput(client.acesso_expira_em),
        max_socios: client.max_socios ?? 0,
      });
    }
  }, [open, client]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const expiresAt = form.acesso_expira_em ? dateInputToIso(form.acesso_expira_em) : null;

      const updatePayload = {
        assinatura: form.assinatura,
        acesso_expira_em: expiresAt,
        max_socios: Number(form.max_socios) > 0 ? Number(form.max_socios) : null,
      };

      const result = await updateClientMutation.mutateAsync({ id: client.id, input: updatePayload });

      try {
        await proxyAction(client.id, "sync-trial-limits", {
          acesso_expira_em: updatePayload.acesso_expira_em,
          max_socios: updatePayload.max_socios,
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

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-4 border-b border-border/50">
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Assinatura e Limites
          </DialogTitle>
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
                type="date"
                value={form.acesso_expira_em}
                onChange={(e) => update("acesso_expira_em", e.target.value)}
                className="bg-secondary/30"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-primary" />
              Limite de Sócios
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="0 = ilimitado"
              value={form.max_socios || ""}
              onChange={(e) => update("max_socios", e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="min-w-[130px]">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
