import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { TenantUnit } from "../types";
import {
  createSharedTenantUnit,
  deleteSharedTenantUnit,
  listSharedTenantUnits,
  updateSharedTenantUnit,
} from "@/services/clients.service";

interface UnitsTabProps {
  readonly tenantId: string;
}

interface UnitFormState {
  code: string;
  name: string;
  city: string;
  state: string;
}

const initialFormState: UnitFormState = {
  code: "",
  name: "",
  city: "",
  state: "",
};

export function UnitsTab({ tenantId }: UnitsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<TenantUnit | null>(null);
  const [form, setForm] = useState<UnitFormState>(initialFormState);

  const queryKey = useMemo(() => ["shared-tenant-units", tenantId], [tenantId]);

  const { data: units = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listSharedTenantUnits(tenantId),
    enabled: Boolean(tenantId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (payload: UnitFormState) =>
      createSharedTenantUnit({
        tenant_id: tenantId,
        code: payload.code.trim().toLowerCase(),
        name: payload.name.trim(),
        city: payload.city.trim() || null,
        state: payload.state.trim() || null,
        is_active: true,
      }),
    onSuccess: () => {
      toast({ title: "Polo criado", description: "O polo foi adicionado com sucesso." });
      invalidate();
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar polo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UnitFormState) =>
      updateSharedTenantUnit(editingUnit!.id, {
        code: payload.code.trim().toLowerCase(),
        name: payload.name.trim(),
        city: payload.city.trim() || null,
        state: payload.state.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Polo atualizado", description: "As alteracoes foram salvas." });
      invalidate();
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar polo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (unitId: string) => deleteSharedTenantUnit(unitId),
    onSuccess: () => {
      toast({ title: "Polo removido", description: "O polo foi removido com sucesso." });
      invalidate();
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover polo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setOpen(false);
    setEditingUnit(null);
    setForm(initialFormState);
  };

  const handleCreate = () => {
    setEditingUnit(null);
    setForm(initialFormState);
    setOpen(true);
  };

  const handleEdit = (unit: TenantUnit) => {
    setEditingUnit(unit);
    setForm({
      code: unit.code,
      name: unit.name,
      city: unit.city || "",
      state: unit.state || "",
    });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast({
        title: "Campos obrigatorios",
        description: "Informe o codigo e o nome do polo.",
        variant: "destructive",
      });
      return;
    }

    if (editingUnit) {
      await updateMutation.mutateAsync(form);
      return;
    }

    await createMutation.mutateAsync(form);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-primary/10 bg-primary/5 p-4">
        <div>
          <p className="font-semibold text-primary">{units.length} polo(s) cadastrados</p>
          <p className="text-sm text-muted-foreground">
            Crie e mantenha os polos municipais deste tenant shared.
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo polo
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.map((unit) => (
            <Card key={unit.id} className="p-5">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{unit.name}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Codigo {unit.code}
                      </p>
                    </div>
                  </div>
                  <Badge variant={unit.is_active ? "default" : "secondary"}>
                    {unit.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary/70" />
                    <span>
                      {[unit.city, unit.state].filter(Boolean).join(" / ") || "Sem localidade"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(unit)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => deleteMutation.mutate(unit.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? handleClose() : setOpen(nextOpen))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Editar polo" : "Novo polo"}</DialogTitle>
            <DialogDescription>
              Cadastre um polo municipal para este tenant do novo modelo shared.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit-code">Codigo *</Label>
              <Input
                id="unit-code"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="Ex: oeiras-centro"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-name">Nome *</Label>
              <Input
                id="unit-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Polo Oeiras Centro"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit-city">Cidade</Label>
                <Input
                  id="unit-city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="Oeiras"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-state">UF</Label>
                <Input
                  id="unit-state"
                  value={form.state}
                  onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
                  placeholder="PI"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : editingUnit ? "Salvar alteracoes" : "Criar polo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
