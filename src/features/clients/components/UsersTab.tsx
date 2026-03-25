import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Users, Mail, Calendar, Shield, Pencil, Key, Users2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { proxyAction } from "@/services/clients.service";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateClientUserLicense } from "../hooks/useClientMutations";
import { toast } from "sonner";

interface ClientUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  acesso_expira_em: string | null;
  max_socios: number | null;
}

interface UsersTabProps {
  readonly clientId: string;
  readonly connectionError: string | null;
  readonly onUsersLoaded: (count: number) => void;
}

export function UsersTab(props: UsersTabProps) {
  return (
    <ErrorBoundary>
      <UsersTabContent {...props} />
    </ErrorBoundary>
  );
}

function UsersTabContent({ clientId, connectionError, onUsersLoaded }: UsersTabProps) {
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const updateMutation = useUpdateClientUserLicense(clientId);

  const { 
    data: users = [], 
    isLoading: loading
  } = useQuery<ClientUser[]>({
    queryKey: ["client-users", clientId],
    queryFn: async () => {
      // Usamos a nova action que consolida auth e public.User
      const data = await proxyAction(clientId, "list-client-members");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.users || []).map((u: any) => ({
        id: u.id,
        email: u.email || "Sem email",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        acesso_expira_em: u.acesso_expira_em || null,
        max_socios: u.max_socios || null,
      }));
    },
    enabled: !connectionError && !!clientId,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  useEffect(() => {
    if (users) {
      onUsersLoaded(users.length);
    }
  }, [users, onUsersLoaded]);

  const handleUpdateLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setIsUpdating(true);
      await updateMutation.mutateAsync({
        userId: editingUser.id,
        updates: {
          acesso_expira_em: editingUser.acesso_expira_em,
          max_socios: editingUser.max_socios ? Number(editingUser.max_socios) : null,
        }
      });
      toast.success("Licença atualizada com sucesso");
      setEditingUser(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error("Erro ao atualizar licença: " + errorMessage);
    } finally {
      setIsUpdating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Buscando usuários do cliente via Proxy..." />;
  }

  return (
    <div className="space-y-4">
      {users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Nenhum usuário encontrado"
          description={connectionError 
            ? "Não foi possível conectar ao projeto para listar os usuários." 
            : "Este projeto ainda não possui usuários cadastrados ou o acesso ao Admin API é restrito."}
        />
      ) : (
        <div className="grid gap-4">
          {users.map((user) => (
            <Card key={user.id} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-sm">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground truncate">{user.email}</p>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider shrink-0">Usuário</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Criado em {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        ID: {user.id.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 md:gap-8 border-t md:border-0 pt-3 md:pt-0">
                  <div className="flex gap-4">
                    <div className="text-left md:text-right min-w-[100px]">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Expira em</p>
                      <p className="text-sm font-medium">
                        {user.acesso_expira_em 
                          ? format(new Date(user.acesso_expira_em), "dd/MM/yyyy", { locale: ptBR })
                          : "Ilimitado"}
                      </p>
                    </div>
                    <div className="text-left md:text-right min-w-[80px]">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Máx. Sócios</p>
                      <p className="text-sm font-medium">
                        {user.max_socios ?? "Ilimitado"}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="text-left md:text-right mr-2 hidden sm:block">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Último Acesso</p>
                      <p className="text-sm font-medium">
                        {user.last_sign_in_at 
                          ? format(new Date(user.last_sign_in_at), "dd/MM 'às' HH:mm", { locale: ptBR })
                          : "Nunca"}
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-9 w-9 text-muted-foreground hover:text-primary shrink-0" 
                      title="Editar Licença"
                      onClick={() => setEditingUser(user)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit License Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleUpdateLicense}>
            <DialogHeader>
              <DialogTitle>Editar Licença de Usuário</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Usuário: <span className="text-foreground">{editingUser?.email}</span></p>
              </div>
              
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="expires_at" className="text-right flex items-center gap-2 col-span-1">
                  <Key className="h-4 w-4" />
                  Expiração
                </Label>
                <div className="col-span-3 space-y-1">
                  <Input
                    id="expires_at"
                    type="date"
                    value={editingUser?.acesso_expira_em ? editingUser.acesso_expira_em.split('T')[0] : ''}
                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, acesso_expira_em: e.target.value ? new Date(e.target.value).toISOString() : null } : null)}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground italic">Deixe vazio para acesso ilimitado/sem expiração.</p>
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="max_socios" className="text-right flex items-center gap-2 col-span-1">
                  <Users2 className="h-4 w-4" />
                  Limite
                </Label>
                <div className="col-span-3 space-y-1">
                  <Input
                    id="max_socios"
                    type="number"
                    placeholder="Ex: 5"
                    value={editingUser?.max_socios ?? ''}
                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, max_socios: e.target.value ? Number(e.target.value) : null } : null)}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground italic">Número de sócios permitidos. Vazio = ilimitado.</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>Cancelar</Button>
              <Button type="submit" disabled={isUpdating}>
                {isUpdating && <LoadingSpinner className="mr-2 h-4 w-4" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
