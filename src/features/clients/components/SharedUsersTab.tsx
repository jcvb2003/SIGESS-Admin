import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield, Trash2, UserCog, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { OperatorType, Project, TenantUser } from "../types";
import {
  createSharedTenantAdmin,
  createSharedTenantOperator,
  deleteSharedTenantUser,
  listSharedTenantUsers,
  updateSharedTenantUser,
} from "@/services/clients.service";

interface SharedUsersTabProps {
  readonly project: Project;
  readonly tenantId: string;
  readonly showGestor?: boolean;
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

const initialOperatorForm: NewOperatorFormState = {
  email: "",
  nome: "",
  password: "",
  operatorType: "presidente",
  autoConfirm: true,
};

const initialGestorForm: NewGestorFormState = {
  email: "",
  nome: "",
  password: "",
  autoConfirm: true,
};

const OPERATOR_TYPE_LABEL: Record<OperatorType, string> = {
  presidente: "Presidente",
  auxiliar: "Auxiliar",
};

export function SharedUsersTab({ project, tenantId, showGestor = false }: SharedUsersTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [gestorOpen, setGestorOpen] = useState(false);
  const [gestorForm, setGestorForm] = useState<NewGestorFormState>(initialGestorForm);
  const [pendingDeleteGestor, setPendingDeleteGestor] = useState<TenantUser | null>(null);

  const [operatorOpen, setOperatorOpen] = useState(false);
  const [operatorForm, setOperatorForm] = useState<NewOperatorFormState>(initialOperatorForm);
  const [pendingDeleteOperator, setPendingDeleteOperator] = useState<TenantUser | null>(null);

  const usersKey = useMemo(() => ["shared-tenant-users", tenantId], [tenantId]);

  const { data: tenantUsers = [], isLoading } = useQuery({
    queryKey: usersKey,
    queryFn: () => listSharedTenantUsers(project, tenantId),
    enabled: Boolean(tenantId),
  });

  const invalidateUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: usersKey });
  };

  const createGestorMutation = useMutation({
    mutationFn: () =>
      createSharedTenantAdmin({
        project,
        tenantId,
        email: gestorForm.email,
        nome: gestorForm.nome,
        password: gestorForm.password,
        autoConfirm: gestorForm.autoConfirm,
      }),
    onSuccess: async () => {
      toast({ title: "Gestor criado" });
      await invalidateUsers();
      setGestorOpen(false);
      setGestorForm(initialGestorForm);
    },
    onError: (e) =>
      toast({
        title: "Erro ao criar gestor",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      }),
  });

  const createOperatorMutation = useMutation({
    mutationFn: () =>
      createSharedTenantOperator({
        project,
        tenantId,
        email: operatorForm.email,
        nome: operatorForm.nome,
        password: operatorForm.password,
        operatorType: operatorForm.operatorType,
        autoConfirm: operatorForm.autoConfirm,
      }),
    onSuccess: async () => {
      toast({ title: "Operador criado" });
      await invalidateUsers();
      setOperatorOpen(false);
      setOperatorForm(initialOperatorForm);
    },
    onError: (e) =>
      toast({
        title: "Erro ao criar operador",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (user: TenantUser) =>
      deleteSharedTenantUser({ project, tenantId, tenantUserId: user.id, authUserId: user.user_id }),
    onSuccess: async () => {
      toast({ title: "Usuário removido" });
      await invalidateUsers();
      setPendingDeleteGestor(null);
      setPendingDeleteOperator(null);
    },
    onError: (e) =>
      toast({
        title: "Erro ao remover usuário",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      }),
  });

  const updateOperatorMutation = useMutation({
    mutationFn: (input: { id: string; patch: Partial<Pick<TenantUser, "operator_type" | "is_active">> }) =>
      updateSharedTenantUser(project, input.id, input.patch),
    onSuccess: async () => {
      toast({ title: "Operador atualizado" });
      await invalidateUsers();
    },
    onError: (e) =>
      toast({
        title: "Erro ao atualizar operador",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      }),
  });

  const gestores = tenantUsers.filter((u) => u.tenant_role === "owner");
  const operadores = tenantUsers.filter((u) => u.tenant_role === "member");

  return (
    <div className="space-y-6">
      {showGestor && (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Gestores ({gestores.length})</p>
          </div>
          <Button onClick={() => setGestorOpen(true)} size="sm" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Gestor
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        ) : gestores.length === 0 ? (
          <p className="px-1 text-sm italic text-muted-foreground">Nenhum gestor cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {gestores.map((gestor) => (
              <div
                key={gestor.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/20 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Shield className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {gestor.user_profiles?.nome || gestor.user_profiles?.email || gestor.user_id}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{gestor.user_profiles?.email || ""}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
      )}

      {showGestor && <Separator />}

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-primary/10 bg-primary/5 p-4">
          <div>
            <p className="font-semibold text-primary">{operadores.length} operador(es) cadastrados</p>
            <p className="text-sm text-muted-foreground">Gerencie os usuários operacionais do tenant.</p>
          </div>
          <Button onClick={() => setOperatorOpen(true)} size="sm" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Novo Operador
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        ) : operadores.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground">Nenhum operador cadastrado.</Card>
        ) : (
          <div className="space-y-2">
            {operadores.map((operador) => (
              <OperatorRow
                key={operador.id}
                user={operador}
                onDelete={() => setPendingDeleteOperator(operador)}
                onToggleActive={() =>
                  updateOperatorMutation.mutate({
                    id: operador.id,
                    patch: { is_active: !operador.is_active },
                  })
                }
                onChangeType={(type) =>
                  updateOperatorMutation.mutate({
                    id: operador.id,
                    patch: { operator_type: type },
                  })
                }
                isPending={updateOperatorMutation.isPending || deleteUserMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={gestorOpen} onOpenChange={(o) => { setGestorOpen(o); if (!o) setGestorForm(initialGestorForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Gestor</DialogTitle>
            <DialogDescription>Crie a conta que vai governar o tenant no Web.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shared-gestor-nome">Nome</Label>
              <Input id="shared-gestor-nome" value={gestorForm.nome} onChange={(e) => setGestorForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shared-gestor-email">Email</Label>
              <Input id="shared-gestor-email" type="email" value={gestorForm.email} onChange={(e) => setGestorForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shared-gestor-password">Senha temporária</Label>
              <Input id="shared-gestor-password" type="text" value={gestorForm.password} onChange={(e) => setGestorForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
              <Checkbox id="shared-gestor-confirm" checked={gestorForm.autoConfirm} onCheckedChange={(c) => setGestorForm((p) => ({ ...p, autoConfirm: c === true }))} />
              <Label htmlFor="shared-gestor-confirm" className="cursor-pointer">Confirmar automaticamente</Label>
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

      <Dialog open={operatorOpen} onOpenChange={(o) => { setOperatorOpen(o); if (!o) setOperatorForm(initialOperatorForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Operador</DialogTitle>
            <DialogDescription>Crie um usuário operacional no nível do tenant.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shared-op-tipo">Nível</Label>
              <Select value={operatorForm.operatorType} onValueChange={(v) => setOperatorForm((p) => ({ ...p, operatorType: v as OperatorType }))}>
                <SelectTrigger id="shared-op-tipo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presidente">Presidente</SelectItem>
                  <SelectItem value="auxiliar">Auxiliar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shared-op-nome">Nome</Label>
              <Input id="shared-op-nome" value={operatorForm.nome} onChange={(e) => setOperatorForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shared-op-email">Email</Label>
              <Input id="shared-op-email" type="email" value={operatorForm.email} onChange={(e) => setOperatorForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shared-op-password">Senha temporária</Label>
              <Input id="shared-op-password" type="text" value={operatorForm.password} onChange={(e) => setOperatorForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
              <Checkbox id="shared-op-confirm" checked={operatorForm.autoConfirm} onCheckedChange={(c) => setOperatorForm((p) => ({ ...p, autoConfirm: c === true }))} />
              <Label htmlFor="shared-op-confirm" className="cursor-pointer">Confirmar automaticamente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOperatorOpen(false)}>Cancelar</Button>
            <Button
              disabled={createOperatorMutation.isPending || !operatorForm.nome.trim() || !operatorForm.email.trim() || !operatorForm.password.trim()}
              onClick={() => createOperatorMutation.mutate()}
            >
              {createOperatorMutation.isPending ? "Criando..." : "Criar Operador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              onClick={() => { if (pendingDeleteGestor) deleteUserMutation.mutate(pendingDeleteGestor); }}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDeleteOperator)} onOpenChange={(o) => { if (!o) setPendingDeleteOperator(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir operador?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteOperator
                ? `${pendingDeleteOperator.user_profiles?.nome || pendingDeleteOperator.user_profiles?.email || "Este operador"} perderá o acesso ao Web.`
                : "Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pendingDeleteOperator) deleteUserMutation.mutate(pendingDeleteOperator); }}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
      <div className="flex min-w-0 items-center gap-2">
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

      <div className="flex shrink-0 items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">{label}</Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" disabled={isPending}>
              <UserCog className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onToggleActive}>
              {user.is_active ? "Desativar" : "Ativar"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={user.operator_type === "presidente"} onClick={() => onChangeType("presidente")}>
              Promover a Presidente
            </DropdownMenuItem>
            <DropdownMenuItem disabled={user.operator_type === "auxiliar"} onClick={() => onChangeType("auxiliar")}>
              Rebaixar a Auxiliar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
