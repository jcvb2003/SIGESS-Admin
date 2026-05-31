import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield, Trash2, UserPlus } from "lucide-react";
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

const initialAdminForm: CreateAdminFormState = {
  email: "",
  nome: "",
  password: "",
  autoConfirm: true,
};

export function SharedUsersTab({ tenantId }: SharedUsersTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState<CreateAdminFormState>(initialAdminForm);
  const [pendingDelete, setPendingDelete] = useState<TenantUser | null>(null);

  const queryKey = useMemo(() => ["shared-tenant-users", tenantId], [tenantId]);

  const { data: tenantUsers = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listSharedTenantUsers(tenantId),
    enabled: Boolean(tenantId),
  });

  const gestores = tenantUsers.filter((u) => u.tenant_role === "owner");

  const createAdminMutation = useMutation({
    mutationFn: () =>
      createSharedTenantAdmin({
        tenantId,
        email: adminForm.email,
        nome: adminForm.nome,
        password: adminForm.password,
        autoConfirm: adminForm.autoConfirm,
      }),
    onSuccess: async () => {
      toast({ title: "Gestor criado", description: "O tenant já possui gestor para acesso ao Web." });
      await queryClient.invalidateQueries({ queryKey });
      setAdminOpen(false);
      setAdminForm(initialAdminForm);
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar gestor",
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
      toast({ title: "Gestor removido", description: "O usuário foi removido do tenant com sucesso." });
      await queryClient.invalidateQueries({ queryKey });
      setPendingDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover gestor",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      {/* Strip */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold leading-none text-primary">{gestores.length}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Gestores</p>
          </div>
        </div>
        <Button onClick={() => setAdminOpen(true)} className="gap-2" size="sm">
          <UserPlus className="h-4 w-4" />
          Novo Gestor
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : gestores.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          Nenhum gestor cadastrado. Crie o gestor inicial para liberar o acesso ao Web.
        </Card>
      ) : (
        <div className="grid gap-4">
          {gestores.map((tenantUser) => (
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
                  <Badge variant="default">Gestor</Badge>
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

      {/* Modal: Novo Gestor */}
      <Dialog open={adminOpen} onOpenChange={(o) => { setAdminOpen(o); if (!o) setAdminForm(initialAdminForm); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Gestor</DialogTitle>
            <DialogDescription>
              Crie a conta que vai entrar no Web e governar o tenant do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-nome">Nome</Label>
              <Input id="admin-nome" value={adminForm.nome} placeholder="Nome do gestor"
                onChange={(e) => setAdminForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input id="admin-email" type="email" value={adminForm.email} placeholder="gestor@cliente.com"
                onChange={(e) => setAdminForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Senha temporária</Label>
              <Input id="admin-password" type="text" value={adminForm.password} placeholder="Senha inicial"
                onChange={(e) => setAdminForm((p) => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
              <Checkbox id="admin-confirm" checked={adminForm.autoConfirm}
                onCheckedChange={(c) => setAdminForm((p) => ({ ...p, autoConfirm: c === true }))} />
              <Label htmlFor="admin-confirm" className="cursor-pointer">Confirmar automaticamente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminOpen(false)}>Cancelar</Button>
            <Button
              disabled={createAdminMutation.isPending || !adminForm.nome.trim() || !adminForm.email.trim() || !adminForm.password.trim()}
              onClick={() => createAdminMutation.mutate()}
            >
              {createAdminMutation.isPending ? "Criando..." : "Criar Gestor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir gestor?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `O gestor ${pendingDelete.user_profiles?.nome || pendingDelete.user_profiles?.email || pendingDelete.user_id} será removido do tenant e perderá o acesso ao Web.`
                : "Esta ação removerá o gestor do tenant."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDelete) deleteMutation.mutate(pendingDelete); }}
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
