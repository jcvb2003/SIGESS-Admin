import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Users, Mail, Calendar, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { proxyAction } from "@/services/clients.service";

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
  const { 
    data: users = [], 
    isLoading: loading
  } = useQuery<ClientUser[]>({
    queryKey: ["client-users", clientId],
    queryFn: async () => {
      const data = await proxyAction(clientId, "list-client-members");
      return (data.users || []).map((u: { 
        id: string; 
        email?: string; 
        created_at: string; 
        last_sign_in_at?: string; 
        acesso_expira_em?: string; 
        max_socios?: number; 
        fingerprints?: string[]; 
        max_devices?: number; 
      }) => ({
        id: u.id,
        email: u.email || "Sem email",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        acesso_expira_em: u.acesso_expira_em || null,
        max_socios: u.max_socios || null,
      }));
    },
    enabled: !connectionError && !!clientId,
    staleTime: 1000 * 60 * 5,
  });

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
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
