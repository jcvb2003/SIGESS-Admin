import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, MapPin, MoreVertical, Pencil, Plus, Shield, Trash2, UserCog, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { OperatorType, Project, TenantUnit, TenantUser, UserUnitMembership } from "../types";
import {
  createSharedTenantAdmin,
  createSharedTenantOperatorWithMembership,
  createSharedTenantUnit,
  deleteSharedTenantUnit,
  deleteSharedTenantUser,
  listSharedMemberships,
  listSharedTenantUnits,
  listSharedTenantUsers,
  updateSharedTenantUnit,
  updateSharedTenantUser,
} from "@/services/clients.service";

interface UnitsTabProps {
  readonly project: Project;
  readonly tenantId: string;
}

interface UnitFormState {
  code: string;
  name: string;
  city: string;
  state: string;
}

interface NewOperatorFormState {
  email: string;
  nome: string;
  password: string;
  operatorType: OperatorType;
  autoConfirm: boolean;
}

interface NewGestorFormState {
  email: string;
  nome: string;
  password: string;
  autoConfirm: boolean;
}

const initialUnitForm: UnitFormState = { code: "", name: "", city: "", state: "" };
const initialOperatorForm: NewOperatorFormState = {
  email: "", nome: "", password: "", operatorType: "presidente", autoConfirm: true,
};
const initialGestorForm: NewGestorFormState = {
  email: "", nome: "", password: "", autoConfirm: true,
};

const OPERATOR_TYPE_LABEL: Record<OperatorType, string> = {
  presidente: "Presidente",
  auxiliar: "Auxiliar",
};

export function UnitsTab({ project, tenantId }: UnitsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Unit dialog
  const [unitOpen, setUnitOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<TenantUnit | null>(null);
  const [unitForm, setUnitForm] = useState<UnitFormState>(initialUnitForm);
  const [pendingDeleteUnit, setPendingDeleteUnit] = useState<TenantUnit | null>(null);

  // Operator dialog
  const [operatorTargetUnit, setOperatorTargetUnit] = useState<TenantUnit | null>(null);
  const [operatorForm, setOperatorForm] = useState<NewOperatorFormState>(initialOperatorForm);
  const [pendingDeleteOperator, setPendingDeleteOperator] = useState<TenantUser | null>(null);

  // Gestor dialog
  const [gestorOpen, setGestorOpen] = useState(false);
  const [gestorForm, setGestorForm] = useState<NewGestorFormState>(initialGestorForm);
  const [pendingDeleteGestor, setPendingDeleteGestor] = useState<TenantUser | null>(null);

  const unitsKey       = useMemo(() => ["shared-tenant-units",       tenantId], [tenantId]);
  const usersKey       = useMemo(() => ["shared-tenant-users",       tenantId], [tenantId]);
  const membershipsKey = useMemo(() => ["shared-tenant-memberships", tenantId], [tenantId]);

  const { data: units       = [], isLoading: loadingUnits }       = useQuery({ queryKey: unitsKey,       queryFn: () => listSharedTenantUnits(project, tenantId),  enabled: Boolean(tenantId) });
  const { data: tenantUsers = [], isLoading: loadingUsers }       = useQuery({ queryKey: usersKey,       queryFn: () => listSharedTenantUsers(project, tenantId),  enabled: Boolean(tenantId) });
  const { data: memberships = [], isLoading: loadingMemberships } = useQuery({ queryKey: membershipsKey, queryFn: () => listSharedMemberships(project, tenantId),  enabled: Boolean(tenantId) });

  const isLoading = loadingUnits || loadingUsers || loadingMemberships;

  const operatorsForUnit = (unitId: string): TenantUser[] => {
    const memberIds = new Set(
      memberships.filter((m: UserUnitMembership) => m.unit_id === unitId).map((m) => m.user_id),
    );
    return tenantUsers.filter((u) => u.tenant_role === "member" && memberIds.has(u.user_id));
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: unitsKey });
    queryClient.invalidateQueries({ queryKey: usersKey });
    queryClient.invalidateQueries({ queryKey: membershipsKey });
  };

  // ── Unit mutations ──

  const createUnitMutation = useMutation({
    mutationFn: (payload: UnitFormState) =>
      createSharedTenantUnit(project, { tenant_id: tenantId, code: payload.code.trim().toLowerCase(), name: payload.name.trim(), city: payload.city.trim() || null, state: payload.state.trim() || null, is_active: true }),
    onSuccess: () => { toast({ title: "Polo criado" }); queryClient.invalidateQueries({ queryKey: unitsKey }); handleCloseUnit(); },
    onError: (e) => toast({ title: "Erro ao criar polo", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  const updateUnitMutation = useMutation({
    mutationFn: (payload: UnitFormState) =>
      updateSharedTenantUnit(project, editingUnit!.id, { code: payload.code.trim().toLowerCase(), name: payload.name.trim(), city: payload.city.trim() || null, state: payload.state.trim() || null }),
    onSuccess: () => { toast({ title: "Polo atualizado" }); queryClient.invalidateQueries({ queryKey: unitsKey }); handleCloseUnit(); },
    onError: (e) => toast({ title: "Erro ao atualizar polo", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  const deleteUnitMutation = useMutation({
    mutationFn: (unitId: string) => deleteSharedTenantUnit(project, unitId),
    onSuccess: () => { toast({ title: "Polo removido" }); queryClient.invalidateQueries({ queryKey: unitsKey }); setPendingDeleteUnit(null); },
    onError: (e) => toast({ title: "Erro ao remover polo", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  // ── Operator mutations ──

  const createOperatorMutation = useMutation({
    mutationFn: () =>
      createSharedTenantOperatorWithMembership({
        project,
        tenantId,
        unitId: operatorTargetUnit!.id,
        email: operatorForm.email,
        nome: operatorForm.nome,
        password: operatorForm.password,
        operatorType: operatorForm.operatorType,
        autoConfirm: operatorForm.autoConfirm,
      }),
    onSuccess: () => {
      toast({ title: "Operador criado", description: `${OPERATOR_TYPE_LABEL[operatorForm.operatorType]} vinculado ao polo.` });
      invalidateAll();
      setOperatorTargetUnit(null);
      setOperatorForm(initialOperatorForm);
    },
    onError: (e) => toast({ title: "Erro ao criar operador", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  const deleteOperatorMutation = useMutation({
    mutationFn: (user: TenantUser) => deleteSharedTenantUser({ project, tenantId, tenantUserId: user.id, authUserId: user.user_id }),
    onSuccess: () => { toast({ title: "Operador removido" }); invalidateAll(); setPendingDeleteOperator(null); },
    onError: (e) => toast({ title: "Erro ao remover operador", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  const updateOperatorMutation = useMutation({
    mutationFn: (input: { id: string; patch: Partial<Pick<TenantUser, "operator_type" | "is_active">> }) =>
      updateSharedTenantUser(project, input.id, input.patch),
    onSuccess: () => { toast({ title: "Operador atualizado" }); queryClient.invalidateQueries({ queryKey: usersKey }); },
    onError: (e) => toast({ title: "Erro ao atualizar operador", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  // ── Gestor mutations ──

  const createGestorMutation = useMutation({
    mutationFn: () => createSharedTenantAdmin({ project, tenantId, email: gestorForm.email, nome: gestorForm.nome, password: gestorForm.password, autoConfirm: gestorForm.autoConfirm }),
    onSuccess: async () => {
      toast({ title: "Gestor criado" });
      await queryClient.invalidateQueries({ queryKey: usersKey });
      setGestorOpen(false);
      setGestorForm(initialGestorForm);
    },
    onError: (e) => toast({ title: "Erro ao criar gestor", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  const deleteGestorMutation = useMutation({
    mutationFn: (user: TenantUser) => deleteSharedTenantUser({ project, tenantId, tenantUserId: user.id, authUserId: user.user_id }),
    onSuccess: async () => { toast({ title: "Gestor removido" }); await queryClient.invalidateQueries({ queryKey: usersKey }); setPendingDeleteGestor(null); },
    onError: (e) => toast({ title: "Erro ao remover gestor", description: e instanceof Error ? e.message : "Erro desconhecido", variant: "destructive" }),
  });

  // ── Helpers ──

  const handleCloseUnit = () => { setUnitOpen(false); setEditingUnit(null); setUnitForm(initialUnitForm); };

  const handleEditUnit = (unit: TenantUnit) => {
    setEditingUnit(unit);
    setUnitForm({ code: unit.code, name: unit.name, city: unit.city || "", state: unit.state || "" });
    setUnitOpen(true);
  };

  const handleUnitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitForm.code.trim() || !unitForm.name.trim()) {
      toast({ title: "Campos obrigatórios", description: "Informe o código e o nome do polo.", variant: "destructive" });
      return;
    }
    if (editingUnit) updateUnitMutation.mutate(unitForm);
    else createUnitMutation.mutate(unitForm);
  };

  const isUnitSubmitting = createUnitMutation.isPending || updateUnitMutation.isPending;

  return (
    <div className="space-y-6">

      {/* ── Gestores ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">
              Gestores ({tenantUsers.filter((u) => u.tenant_role === "owner").length})
            </p>
          </div>
          <Button onClick={() => setGestorOpen(true)} size="sm" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Gestor
          </Button>
        </div>

        {loadingUsers ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        ) : tenantUsers.filter((u) => u.tenant_role === "owner").length === 0 ? (
          <p className="text-sm text-muted-foreground italic px-1">Nenhum gestor cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {tenantUsers.filter((u) => u.tenant_role === "owner").map((gestor) => (
              <div
                key={gestor.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/20 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Shield className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {gestor.user_profiles?.nome || gestor.user_profiles?.email || gestor.user_id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{gestor.user_profiles?.email || ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={gestor.is_active ? "default" : "secondary"}>
                    {gestor.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingDeleteGestor(gestor)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Polos ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-primary/10 bg-primary/5 p-4">
          <div>
            <p className="font-semibold text-primary">{units.length} polo(s) cadastrados</p>
            <p className="text-sm text-muted-foreground">Gerencie os polos e seus operadores.</p>
          </div>
          <Button onClick={() => { setEditingUnit(null); setUnitForm(initialUnitForm); setUnitOpen(true); }} className="gap-2">
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
            {units.map((unit) => {
              const operators = operatorsForUnit(unit.id);
              return (
                <Card key={unit.id} className="flex flex-col p-5 gap-4">
                  {/* Unit header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary/10 p-2">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{unit.name}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Código {unit.code}
                        </p>
                      </div>
                    </div>
                    <Badge variant={unit.is_active ? "default" : "secondary"}>
                      {unit.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  {/* Localidade */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 text-primary/70" />
                    <span>{[unit.city, unit.state].filter(Boolean).join(" / ") || "Sem localidade"}</span>
                  </div>

                  <Separator />

                  {/* Operators */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Operadores
                    </p>
                    {operators.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Nenhum operador vinculado.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {operators.map((op) => (
                          <OperatorRow
                            key={op.id}
                            user={op}
                            onDelete={() => setPendingDeleteOperator(op)}
                            onToggleActive={() => updateOperatorMutation.mutate({ id: op.id, patch: { is_active: !op.is_active } })}
                            onChangeType={(type) => updateOperatorMutation.mutate({ id: op.id, patch: { operator_type: type } })}
                            isPending={updateOperatorMutation.isPending || deleteOperatorMutation.isPending}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => { setOperatorTargetUnit(unit); setOperatorForm(initialOperatorForm); }}
                    >
                      <UserPlus className="h-4 w-4" />
                      Novo Operador
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditUnit(unit)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingDeleteUnit(unit)}
                        disabled={deleteUnitMutation.isPending}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}

      {/* Novo/Editar Polo */}
      <Dialog open={unitOpen} onOpenChange={(o) => (!o ? handleCloseUnit() : setUnitOpen(o))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Editar polo" : "Novo polo"}</DialogTitle>
            <DialogDescription>Cadastre um polo municipal para este tenant shared.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUnitSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit-code">Código *</Label>
              <Input id="unit-code" value={unitForm.code}
                onChange={(e) => setUnitForm((p) => ({ ...p, code: e.target.value }))}
                placeholder="ex: oeiras-centro" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-name">Nome *</Label>
              <Input id="unit-name" value={unitForm.name}
                onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="ex: Polo Oeiras Centro" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit-city">Cidade</Label>
                <Input id="unit-city" value={unitForm.city}
                  onChange={(e) => setUnitForm((p) => ({ ...p, city: e.target.value }))}
                  placeholder="Oeiras" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-state">UF</Label>
                <Input id="unit-state" value={unitForm.state}
                  onChange={(e) => setUnitForm((p) => ({ ...p, state: e.target.value }))}
                  placeholder="PI" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseUnit}>Cancelar</Button>
              <Button type="submit" disabled={isUnitSubmitting}>
                {isUnitSubmitting ? "Salvando..." : editingUnit ? "Salvar alterações" : "Criar polo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Novo Operador */}
      <Dialog
        open={Boolean(operatorTargetUnit)}
        onOpenChange={(o) => { if (!o) { setOperatorTargetUnit(null); setOperatorForm(initialOperatorForm); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Operador</DialogTitle>
            <DialogDescription>
              {operatorTargetUnit ? `Criando operador para o polo ${operatorTargetUnit.name}.` : "Criando operador."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="op-tipo">Nível</Label>
              <Select value={operatorForm.operatorType} onValueChange={(v) => setOperatorForm((p) => ({ ...p, operatorType: v as OperatorType }))}>
                <SelectTrigger id="op-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presidente">Presidente</SelectItem>
                  <SelectItem value="auxiliar">Auxiliar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="op-nome">Nome</Label>
              <Input id="op-nome" value={operatorForm.nome} placeholder="Nome do operador"
                onChange={(e) => setOperatorForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="op-email">Email</Label>
              <Input id="op-email" type="email" value={operatorForm.email} placeholder="operador@cliente.com"
                onChange={(e) => setOperatorForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="op-password">Senha temporária</Label>
              <Input id="op-password" type="text" value={operatorForm.password} placeholder="Senha inicial"
                onChange={(e) => setOperatorForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
              <Checkbox id="op-confirm" checked={operatorForm.autoConfirm}
                onCheckedChange={(c) => setOperatorForm((p) => ({ ...p, autoConfirm: c === true }))} />
              <Label htmlFor="op-confirm" className="cursor-pointer">Confirmar automaticamente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOperatorTargetUnit(null); setOperatorForm(initialOperatorForm); }}>
              Cancelar
            </Button>
            <Button
              disabled={createOperatorMutation.isPending || !operatorForm.nome.trim() || !operatorForm.email.trim() || !operatorForm.password.trim()}
              onClick={() => createOperatorMutation.mutate()}
            >
              {createOperatorMutation.isPending ? "Criando..." : "Criar Operador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo Gestor */}
      <Dialog open={gestorOpen} onOpenChange={(o) => { setGestorOpen(o); if (!o) setGestorForm(initialGestorForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Gestor</DialogTitle>
            <DialogDescription>Crie a conta que vai governar o tenant no Web.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gest-nome">Nome</Label>
              <Input id="gest-nome" value={gestorForm.nome} placeholder="Nome do gestor"
                onChange={(e) => setGestorForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gest-email">Email</Label>
              <Input id="gest-email" type="email" value={gestorForm.email} placeholder="gestor@cliente.com"
                onChange={(e) => setGestorForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gest-password">Senha temporária</Label>
              <Input id="gest-password" type="text" value={gestorForm.password} placeholder="Senha inicial"
                onChange={(e) => setGestorForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
              <Checkbox id="gest-confirm" checked={gestorForm.autoConfirm}
                onCheckedChange={(c) => setGestorForm((p) => ({ ...p, autoConfirm: c === true }))} />
              <Label htmlFor="gest-confirm" className="cursor-pointer">Confirmar automaticamente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGestorOpen(false)}>Cancelar</Button>
            <Button
              disabled={createGestorMutation.isPending || !gestorForm.nome.trim() || !gestorForm.email.trim() || !gestorForm.password.trim()}
              onClick={() => createGestorMutation.mutate()}
            >
              {createGestorMutation.isPending ? "Criando..." : "Criar Gestor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: excluir polo */}
      <AlertDialog open={Boolean(pendingDeleteUnit)} onOpenChange={(o) => { if (!o) setPendingDeleteUnit(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir polo?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteUnit
                ? `O polo "${pendingDeleteUnit.name}" e todos os seus vínculos serão removidos permanentemente.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingDeleteUnit) deleteUnitMutation.mutate(pendingDeleteUnit.id); }}
              disabled={deleteUnitMutation.isPending}
            >
              {deleteUnitMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: excluir operador */}
      <AlertDialog open={Boolean(pendingDeleteOperator)} onOpenChange={(o) => { if (!o) setPendingDeleteOperator(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir operador?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteOperator
                ? `${pendingDeleteOperator.user_profiles?.nome || pendingDeleteOperator.user_profiles?.email || "Este operador"} perderá o acesso ao Web permanentemente.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingDeleteOperator) deleteOperatorMutation.mutate(pendingDeleteOperator); }}
              disabled={deleteOperatorMutation.isPending}
            >
              {deleteOperatorMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: excluir gestor */}
      <AlertDialog open={Boolean(pendingDeleteGestor)} onOpenChange={(o) => { if (!o) setPendingDeleteGestor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir gestor?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteGestor
                ? `${pendingDeleteGestor.user_profiles?.nome || pendingDeleteGestor.user_profiles?.email || pendingDeleteGestor.user_id} perderá o acesso ao Web.`
                : "Esta ação removerá o gestor do tenant."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingDeleteGestor) deleteGestorMutation.mutate(pendingDeleteGestor); }}
              disabled={deleteGestorMutation.isPending}
            >
              {deleteGestorMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── OperatorRow ─────────────────────────────────────────────────────────────

function OperatorRow({
  user,
  onDelete,
  onToggleActive,
  onChangeType,
  isPending,
}: {
  user: TenantUser;
  onDelete: () => void;
  onToggleActive: () => void;
  onChangeType: (type: OperatorType) => void;
  isPending: boolean;
}) {
  const label = user.operator_type === "presidente"
    ? "Presidente"
    : user.operator_type === "auxiliar"
      ? "Auxiliar"
      : "Operador";

  return (
    <div className={`flex items-center justify-between gap-2 rounded-md border border-border/40 bg-secondary/20 px-3 py-2 ${!user.is_active ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        <UserCog className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-none">
            {user.user_profiles?.nome || user.user_profiles?.email || user.user_id}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user.user_profiles?.email || ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant="outline" className="text-[10px]">{label}</Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              disabled={isPending}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onToggleActive}>
              {user.is_active ? "Desativar" : "Ativar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={user.operator_type === "presidente"}
              onClick={() => onChangeType("presidente")}
            >
              Promover a Presidente
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={user.operator_type === "auxiliar"}
              onClick={() => onChangeType("auxiliar")}
            >
              Rebaixar a Auxiliar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
