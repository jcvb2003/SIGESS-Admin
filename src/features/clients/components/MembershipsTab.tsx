import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { TenantUnit, UserProfile, UserUnitMembership } from "../types";
import {
  createSharedMembership,
  deleteSharedMembership,
  listSharedMemberships,
  listSharedUserProfiles,
  updateSharedMembership,
} from "@/services/clients.service";

interface MembershipsTabProps {
  readonly tenantId: string;
  readonly units: TenantUnit[];
}

interface MembershipFormState {
  user_id: string;
  unit_id: string;
  role: UserUnitMembership["role"];
  is_default: boolean;
}

const initialMembershipState: MembershipFormState = {
  user_id: "",
  unit_id: "",
  role: "unit_manager",
  is_default: false,
};

function getRoleLabel(role: UserUnitMembership["role"]) {
  switch (role) {
    case "tenant_admin":
      return "Tenant admin";
    case "unit_manager":
      return "Gestor do polo";
    case "unit_operator":
      return "Operador";
    case "unit_viewer":
      return "Leitor";
    default:
      return role;
  }
}

export function MembershipsTab({ tenantId, units }: MembershipsTabProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MembershipFormState>(initialMembershipState);

  const membershipsQueryKey = useMemo(
    () => ["shared-memberships", tenantId],
    [tenantId],
  );
  const usersQueryKey = ["shared-user-profiles"];

  const { data: memberships = [], isLoading: membershipsLoading } = useQuery({
    queryKey: membershipsQueryKey,
    queryFn: () => listSharedMemberships(tenantId),
    enabled: Boolean(tenantId),
  });

  const { data: userProfiles = [], isLoading: usersLoading } = useQuery({
    queryKey: usersQueryKey,
    queryFn: () => listSharedUserProfiles(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: MembershipFormState) =>
      createSharedMembership({
        user_id: payload.user_id,
        tenant_id: tenantId,
        unit_id: payload.unit_id,
        role: payload.role,
        is_active: true,
        is_default: payload.is_default,
      }),
    onSuccess: () => {
      toast({ title: "Membership criada", description: "O usuario foi vinculado ao polo." });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKey });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar membership",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      membershipId,
      updates,
    }: {
      membershipId: string;
      updates: Partial<Omit<UserUnitMembership, "id" | "created_at" | "updated_at">>;
    }) => updateSharedMembership(membershipId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipsQueryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (membershipId: string) => deleteSharedMembership(membershipId),
    onSuccess: () => {
      toast({ title: "Membership removida", description: "O vinculo foi removido com sucesso." });
      queryClient.invalidateQueries({ queryKey: membershipsQueryKey });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover membership",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const usersById = useMemo(
    () => new Map(userProfiles.map((profile) => [profile.id, profile])),
    [userProfiles],
  );
  const unitsById = useMemo(
    () => new Map(units.map((unit) => [unit.id, unit])),
    [units],
  );

  const handleClose = () => {
    setOpen(false);
    setForm(initialMembershipState);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.user_id || !form.unit_id) {
      toast({
        title: "Campos obrigatorios",
        description: "Selecione um usuario e um polo.",
        variant: "destructive",
      });
      return;
    }

    await createMutation.mutateAsync(form);
  };

  const isLoading = membershipsLoading || usersLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border border-primary/10 bg-primary/5 p-4">
        <div>
          <p className="font-semibold text-primary">{memberships.length} membership(s) cadastradas</p>
          <p className="text-sm text-muted-foreground">
            Controle quais usuarios acessam cada polo e qual e o polo padrao.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2" disabled={units.length === 0}>
          <UserPlus className="h-4 w-4" />
          Nova membership
        </Button>
      </div>

      {units.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Crie pelo menos um polo antes de vincular usuarios.
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4">
          {memberships.map((membership) => {
            const user = usersById.get(membership.user_id);
            const unit = membership.unit_id ? unitsById.get(membership.unit_id) : null;

            return (
              <Card key={membership.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <p className="font-semibold text-foreground">
                        {user?.nome || user?.email || membership.user_id}
                      </p>
                      {membership.is_default && (
                        <Badge variant="default">Padrao</Badge>
                      )}
                      {!membership.is_active && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{user?.email || "Sem email"}</span>
                      <span>•</span>
                      <span>{unit?.name || "Tenant admin sem polo"}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Select
                      value={membership.role}
                      onValueChange={(value) =>
                        updateMutation.mutate({
                          membershipId: membership.id,
                          updates: { role: value as UserUnitMembership["role"] },
                        })
                      }
                    >
                      <SelectTrigger className="w-[190px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tenant_admin">Tenant admin</SelectItem>
                        <SelectItem value="unit_manager">Gestor do polo</SelectItem>
                        <SelectItem value="unit_operator">Operador</SelectItem>
                        <SelectItem value="unit_viewer">Leitor</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant={membership.is_default ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        updateMutation.mutate({
                          membershipId: membership.id,
                          updates: { is_default: !membership.is_default },
                        })
                      }
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {membership.is_default ? "Padrao" : "Definir padrao"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(membership.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? handleClose() : setOpen(nextOpen))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova membership</DialogTitle>
            <DialogDescription>
              Vincule um usuario existente a um polo e defina o papel dele no tenant shared.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="membership-user">Usuario *</Label>
              <Select
                value={form.user_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, user_id: value }))}
              >
                <SelectTrigger id="membership-user">
                  <SelectValue placeholder="Selecione um usuario" />
                </SelectTrigger>
                <SelectContent>
                  {userProfiles.map((profile: UserProfile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.nome || profile.email || profile.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="membership-unit">Polo *</Label>
              <Select
                value={form.unit_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, unit_id: value }))}
              >
                <SelectTrigger id="membership-unit">
                  <SelectValue placeholder="Selecione um polo" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="membership-role">Papel *</Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    role: value as UserUnitMembership["role"],
                  }))
                }
              >
                <SelectTrigger id="membership-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant_admin">Tenant admin</SelectItem>
                  <SelectItem value="unit_manager">Gestor do polo</SelectItem>
                  <SelectItem value="unit_operator">Operador</SelectItem>
                  <SelectItem value="unit_viewer">Leitor</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getRoleLabel(form.role)}
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
              <Checkbox
                id="membership-default"
                checked={form.is_default}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, is_default: checked === true }))
                }
              />
              <Label htmlFor="membership-default" className="cursor-pointer">
                Definir este polo como padrao para o usuario
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar membership"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
