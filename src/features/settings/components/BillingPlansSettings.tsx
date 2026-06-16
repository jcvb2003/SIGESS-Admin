import { useState } from "react";
import { formatDate } from "@/shared/utils/date";
import { CreditCard, Plus, Trash2, Pencil, Loader2, Infinity } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useBillingPlans,
  useCreateBillingPlan,
  useUpdateBillingPlan,
  useDeleteBillingPlan,
} from "../hooks/useBillingPlans";
import type { BillingPlan } from "@/features/billing/types";
import type { BillingPlanInput } from "@/features/billing/services/billing.service";

const EMPTY_FORM: BillingPlanInput = {
  name: "",
  max_socios_from: 0,
  max_socios_to: null,
  price_monthly: 0,
  price_annual: 0,
  effective_from: new Date().toISOString().split("T")[0],
  active: true,
};

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtFaixa(from: number, to: number | null) {
  return to == null ? `${from}+` : `${from}–${to}`;
}

interface PlanFormProps {
  initial: BillingPlanInput;
  onSubmit: (values: BillingPlanInput) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}

function PlanForm({ initial, onSubmit, onCancel, isPending }: PlanFormProps) {
  const [form, setForm] = useState<BillingPlanInput>(initial);

  const set = <K extends keyof BillingPlanInput>(key: K, value: BillingPlanInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (form.price_monthly <= 0 || form.price_annual <= 0) { toast.error("Preços devem ser maiores que zero"); return; }
    await onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="plan-name">Nome do plano</Label>
        <Input
          id="plan-name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="ex: Básico"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="plan-from">Sócios (de)</Label>
          <Input
            id="plan-from"
            type="number"
            min={0}
            value={form.max_socios_from}
            onChange={(e) => set("max_socios_from", Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-to">Sócios (até)</Label>
          <Input
            id="plan-to"
            type="number"
            min={0}
            placeholder="ilimitado"
            value={form.max_socios_to ?? ""}
            onChange={(e) =>
              set("max_socios_to", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="plan-monthly">Preço mensal (R$)</Label>
          <Input
            id="plan-monthly"
            type="number"
            min={0}
            step={0.01}
            value={form.price_monthly}
            onChange={(e) => set("price_monthly", Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan-annual">Preço anual (R$)</Label>
          <Input
            id="plan-annual"
            type="number"
            min={0}
            step={0.01}
            value={form.price_annual}
            onChange={(e) => set("price_annual", Number(e.target.value))}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="plan-from-date">Vigência a partir de</Label>
        <Input
          id="plan-from-date"
          type="date"
          value={form.effective_from}
          onChange={(e) => set("effective_from", e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="plan-active"
          checked={form.active}
          onCheckedChange={(v) => set("active", v)}
        />
        <Label htmlFor="plan-active">Ativo</Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </DialogFooter>
    </form>
  );
}

export function BillingPlansSettings() {
  const { data: plans = [], isLoading } = useBillingPlans();
  const createPlan = useCreateBillingPlan();
  const updatePlan = useUpdateBillingPlan();
  const deletePlan = useDeleteBillingPlan();

  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<BillingPlan | null>(null);

  const openCreate = () => { setEditing(null); setDialogMode("create"); };
  const openEdit = (plan: BillingPlan) => { setEditing(plan); setDialogMode("edit"); };
  const closeDialog = () => { setDialogMode(null); setEditing(null); };

  const handleCreate = async (values: BillingPlanInput) => {
    try {
      await createPlan.mutateAsync(values);
      toast.success("Plano criado com sucesso");
      closeDialog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar plano");
    }
  };

  const handleEdit = async (values: BillingPlanInput) => {
    if (!editing) return;
    try {
      await updatePlan.mutateAsync({ id: editing.id, input: values });
      toast.success("Plano atualizado");
      closeDialog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar plano");
    }
  };

  const handleToggleActive = async (plan: BillingPlan) => {
    try {
      await updatePlan.mutateAsync({ id: plan.id, input: { active: !plan.active } });
      toast.success(plan.active ? "Plano desativado" : "Plano ativado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar plano");
    }
  };

  const handleDelete = async (plan: BillingPlan) => {
    if (!confirm(`Excluir o plano "${plan.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deletePlan.mutateAsync(plan.id);
      toast.success("Plano excluído");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("violates foreign key") || msg.includes("foreign key constraint")) {
        toast.error("Plano em uso — desative-o em vez de excluir.");
      } else {
        toast.error(msg || "Erro ao excluir plano");
      }
    }
  };

  const editInitial: BillingPlanInput = editing
    ? {
        name: editing.name,
        max_socios_from: editing.max_socios_from,
        max_socios_to: editing.max_socios_to,
        price_monthly: editing.price_monthly,
        price_annual: editing.price_annual,
        effective_from: editing.effective_from,
        active: editing.active,
      }
    : EMPTY_FORM;

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Planos de Cobrança</h2>
              <p className="text-sm text-muted-foreground">
                Gerencie os planos disponíveis para contratação
              </p>
            </div>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo plano
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Nenhum plano cadastrado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Nome</th>
                  <th className="pb-2 pr-4 font-medium">Sócios</th>
                  <th className="pb-2 pr-4 font-medium">Mensal</th>
                  <th className="pb-2 pr-4 font-medium">Anual</th>
                  <th className="pb-2 pr-4 font-medium">Vigência</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {plans.map((plan) => (
                  <tr key={plan.id} className="group">
                    <td className="py-3 pr-4 font-medium">{plan.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-0.5">
                        {plan.max_socios_to == null
                          ? <>{plan.max_socios_from}+<Infinity className="h-3.5 w-3.5" /></>
                          : fmtFaixa(plan.max_socios_from, plan.max_socios_to)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">{fmtBRL(plan.price_monthly)}</td>
                    <td className="py-3 pr-4 tabular-nums">{fmtBRL(plan.price_annual)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {formatDate(plan.effective_from)}
                    </td>
                    <td className="py-3 pr-4">
                      <Switch
                        checked={plan.active}
                        onCheckedChange={() => handleToggleActive(plan)}
                        disabled={updatePlan.isPending}
                        aria-label={plan.active ? "Desativar plano" : "Ativar plano"}
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(plan)}
                          aria-label="Editar plano"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(plan)}
                          disabled={deletePlan.isPending}
                          aria-label="Excluir plano"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "Novo plano" : `Editar: ${editing?.name}`}
            </DialogTitle>
          </DialogHeader>
          {dialogMode === "create" && (
            <PlanForm
              initial={EMPTY_FORM}
              onSubmit={handleCreate}
              onCancel={closeDialog}
              isPending={createPlan.isPending}
            />
          )}
          {dialogMode === "edit" && (
            <PlanForm
              initial={editInitial}
              onSubmit={handleEdit}
              onCancel={closeDialog}
              isPending={updatePlan.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
