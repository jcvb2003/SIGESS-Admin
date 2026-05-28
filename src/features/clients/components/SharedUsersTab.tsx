import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { TenantUser } from "../types";
import {
  createSharedTenantAdmin,
  deleteSharedTenantUser,
  listSharedTenantUsers,
} from "@/services/clients.service";

interface SharedUsersTabProps {
  readonly tenantId: string;
}

interface CreateAdminFormState {
  email: string;
  nome: string;
  password: string;
  autoConfirm: boolean;
}

const initialFormState: CreateAdminFormState = {
  email: "",
  nome: "",
  password: "",
  autoConfirm: true,
};

function getTenantRoleLabel(role: TenantUser["tenant_role"]) {
  return role === "owner" ? "Gestor" : "Operador";
}

export function SharedUsersTab({ tenantId }: SharedUsersTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateAdminFormState>(initialFormState);
  const [pendingDelete, setPendingDelete] = useState<TenantUser | null>(null);

  const queryKey = useMemo(() => ["shared-tenant-users", tenantId], [tenantId]);

  const { data: tenantUsers = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listSharedTenantUsers(tenantId),
    enabled: Boolean(tenantId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSharedTenantAdmin({
        tenantId,
        email: form.email,
        nome: form.nome,
        password: form.password,
        autoConfirm: form.autoConfirm,
      }),
    onSuccess: async () => {
      toast({
        title: "Gestor criado",
        description: "O tenant agora ja possui o gestor inicial para acesso ao Web.",
      });
      await queryClient.invalidateQueries({ queryKey });
      setOpen(false);
      setForm(initialFormState);
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar administrador",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tenantUser: TenantUser) =>
      deleteSharedTenantUser({
        tenantId,
        tenantUserId: tenantUser.id,
        authUserId: tenantUser.user_id,
      }),
    onSuccess: async () => {
      toast({
        title: "Gestor excluido",
        description: "O usuario foi removido do tenant shared com sucesso.",
      });
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir gestor",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const ownerCount = tenantUsers.filter((user) => user.tenant_role === "owner").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-primary/10 bg-primary/5 p-4">
        <div>
          <p className="font-semibold text-primary">{tenantUsers.length} usuario(s) no tenant</p>
          <p className="text-sm text-muted-foreground">
            Crie o gestor inicial do cliente e acompanhe quem pertence a este tenant.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo Gestor
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Usuarios</p>
              <p className="text-xl font-bold text-foreground">{tenantUsers.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gestores</p>
              <p className="text-xl font-bold text-foreground">{ownerCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/15 p-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="text-sm font-medium text-foreground">
                {ownerCount > 0 ? "Cliente pronto para acessar o Web" : "Gestor inicial pendente"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tenantUsers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum usuario foi vinculado a este tenant ainda. Crie o gestor inicial para liberar o acesso ao Web.
        </Card>
      ) : (
        <div className="grid gap-4">
          {tenantUsers.map((tenantUser) => (
            <Card key={tenantUser.id} className="p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">
                    {tenantUser.user_profiles?.nome || tenantUser.user_profiles?.email || tenantUser.user_id}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tenantUser.user_profiles?.email || "Sem email"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={tenantUser.tenant_role === "owner" ? "default" : "secondary"}>
                    {getTenantRoleLabel(tenantUser.tenant_role)}
                  </Badge>
                  <Badge variant={tenantUser.is_active ? "default" : "secondary"}>
                    {tenantUser.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setPendingDelete(tenantUser)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setForm(initialFormState);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Gestor</DialogTitle>
            <DialogDescription>
              Crie a conta que vai entrar no Web e governar o tenant do cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shared-admin-name">Nome</Label>
              <Input
                id="shared-admin-name"
                value={form.nome}
                onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                placeholder="Nome do presidente ou gestor"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shared-admin-email">Email</Label>
              <Input
                id="shared-admin-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="presidente@cliente.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shared-admin-password">Senha temporaria</Label>
              <Input
                id="shared-admin-password"
                type="text"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Defina uma senha inicial"
              />
            </div>

            <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
              <Checkbox
                id="shared-admin-confirm"
                checked={form.autoConfirm}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, autoConfirm: checked === true }))
                }
              />
              <Label htmlFor="shared-admin-confirm" className="cursor-pointer">
                Confirmar usuario automaticamente
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                createMutation.isPending ||
                !form.nome.trim() ||
                !form.email.trim() ||
                !form.password.trim()
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Criando..." : "Criar administrador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(openState) => {
          if (!openState) {
            setPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir gestor?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `O usuario ${pendingDelete.user_profiles?.nome || pendingDelete.user_profiles?.email || pendingDelete.user_id} sera removido do tenant shared e perdera o acesso ao Web.`
                : "Esta acao removera o usuario do tenant shared."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  deleteMutation.mutate(pendingDelete);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
