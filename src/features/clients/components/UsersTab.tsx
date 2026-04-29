import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Users, Mail, Calendar, Shield, RefreshCw, Trash2, UserMinus, UserCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { proxyAction } from "@/services/clients.service";
import { AddClientUserDialog } from "./AddClientUserDialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ClientUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  acesso_expira_em: string | null;
  max_socios: number | null;
  role: string;
  isAdmin: boolean;
  isActive: boolean;
  hasLegacyMetadata?: boolean;
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);

  const { 
    data: users = [], 
    isLoading: loading,
    refetch
  } = useQuery<ClientUser[]>({
    queryKey: ["client-users", clientId],
    queryFn: async () => {
      const data = await proxyAction(clientId, "list-client-members");
      console.log('DEBUG: Proxy response for client', clientId, data);
      return (data.users || []).map((u: any) => ({
        id: u.id,
        email: u.email || "Sem email",
        name: u.nome || u.user_metadata?.nome || u.user_metadata?.full_name || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        acesso_expira_em: u.acesso_expira_em || null,
        max_socios: u.max_socios || null,
        role: u.role || (u.isAdmin ? 'admin' : 'user'),
        isAdmin: u.isAdmin || false,
        isActive: u.ativo !== false,
        hasLegacyMetadata: u.hasLegacyMetadata
      }));
    },
    enabled: !connectionError && !!clientId,
    staleTime: 1000 * 60 * 5,
  });

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingId(userId);
    try {
      await proxyAction(clientId, "update-client-member", { 
        userId, 
        updates: { role: newRole } 
      });
      
      toast({
        title: "Role atualizada!",
        description: `O acesso foi alterado para ${newRole === 'admin' ? 'Administrador' : 'Auxiliar'}.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
    } catch (error) {
      toast({
        title: "Erro ao atualizar role",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };
  
  const handleRepairSync = async () => {
    setIsRepairing(true);
    try {
      const result = await proxyAction(clientId, "repair-user-sync");
      
      toast({
        title: "Sincronização reparada!",
        description: `Processados ${result.totalProcessed} usuários. ${result.repairedAuthMetadata} metadados corrigidos para o padrão 'role'.`,
      });
      
      refetch();
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
    } catch (error) {
      toast({
        title: "Erro no reparo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsRepairing(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`TEM CERTEZA? Isso excluirá o acesso de ${email} PERMANENTEMENTE.\n\nRegistros financeiros e sócios criados por este usuário serão preservados como históricos.`)) {
      return;
    }

    setUpdatingId(userId);
    try {
      await proxyAction(clientId, "delete-client-member", { userId });
      
      toast({
        title: "Usuário excluído",
        description: "O acesso foi removido com sucesso.",
      });
      
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleStatus = async (userId: string, currentActive: boolean) => {
    setUpdatingId(userId);
    try {
      await proxyAction(clientId, "ban-client-member", { 
        userId, 
        active: !currentActive 
      });
      
      toast({
        title: currentActive ? "Usuário desativado" : "Usuário ativado",
        description: currentActive ? "O acesso foi bloqueado." : "O acesso foi restaurado.",
      });
      
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
    } catch (error) {
      toast({
        title: "Erro ao alterar status",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  useEffect(() => {
    if (users) {
      onUsersLoaded(users.length);
    }
  }, [users, onUsersLoaded]);

  if (loading) {
    return <LoadingSpinner message="Buscando usuários do cliente via Proxy..." />;
  }

  return (
    <div className="space-y-4">
          <div className="flex justify-between items-center bg-primary/5 p-4 rounded-lg border border-primary/10">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">{users.length} Usuários Ativos</span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRepairSync}
                disabled={isRepairing}
                className="h-8 gap-2 border-primary/20 hover:bg-primary/10 text-primary"
              >
                <RefreshCw className={`h-4 w-4 ${isRepairing ? "animate-spin" : ""}`} />
                {isRepairing ? "Reparando..." : "Reparar Sincronia"}
              </Button>
              <AddClientUserDialog clientId={clientId} onUserAdded={refetch} />
            </div>
          </div>

          <div className="grid gap-4">
            {users.map((user) => (
              <Card key={user.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-sm">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground truncate">{user.name || user.email}</p>
                        <Badge 
                          variant={user.isAdmin ? "default" : "outline"}
                          className={`text-[10px] uppercase font-bold tracking-wider shrink-0 ${user.isAdmin ? "bg-primary" : ""}`}
                        >
                          {user.isAdmin ? "Administrador" : "Auxiliar"}
                        </Badge>
                        {!user.isActive && (
                          <Badge variant="destructive" className="text-[10px] uppercase font-bold tracking-wider shrink-0">
                            Inativo
                          </Badge>
                        )}
                        {user.hasLegacyMetadata && (
                          <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Legacy
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {user.name && (
                          <span className="flex items-center gap-1 font-medium text-primary/70">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                        )}
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
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Nível de Acesso</p>
                        <Select 
                          disabled={updatingId === user.id} 
                          value={user.role === 'admin' ? 'admin' : 'user'}
                          onValueChange={(val) => handleRoleChange(user.id, val)}
                        >
                          <SelectTrigger className="h-8 w-[120px] text-xs font-medium mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="user">Auxiliar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="text-left md:text-right min-w-[80px]">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Máx. Sócios</p>
                        <p className="text-sm font-medium mt-1">
                          {user.max_socios ?? "Ilimitado"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 ml-auto">
                      <div className="text-left md:text-right mr-2 hidden sm:block">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Último Acesso</p>
                        <p className="text-sm font-medium mt-1">
                          {user.last_sign_in_at 
                            ? format(new Date(user.last_sign_in_at), "dd/MM 'às' HH:mm", { locale: ptBR })
                            : "Nunca"}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1 border-l pl-4 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-9 w-9 rounded-full",
                            user.isActive ? "text-muted-foreground hover:text-amber-600 hover:bg-amber-50" : "text-amber-600 bg-amber-50 hover:bg-amber-100"
                          )}
                          title={user.isActive ? "Desativar usuário" : "Ativar usuário"}
                          disabled={updatingId === user.id}
                          onClick={() => handleToggleStatus(user.id, user.isActive)}
                        >
                          {user.isActive ? <UserMinus className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Excluir acesso permanentemente"
                          disabled={updatingId === user.id}
                          onClick={() => handleDeleteUser(user.id, user.email)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
    </div>
  );
}
