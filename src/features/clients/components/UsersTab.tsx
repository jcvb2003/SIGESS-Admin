import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Users, Mail, Calendar, Shield, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      const data = await proxyAction(clientId, "list-users");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.users || []).map((u: any) => ({
        id: u.id,
        email: u.email || "Sem email",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
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
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 shadow-sm">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{user.email}</p>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider">Usuário</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
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

                <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-0 pt-3 md:pt-0">
                  <div className="text-left md:text-right">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tighter">Último Acesso</p>
                    <p className="text-sm font-medium">
                      {user.last_sign_in_at 
                        ? format(new Date(user.last_sign_in_at), "dd/MM 'às' HH:mm", { locale: ptBR })
                        : "Nunca acessou"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Ver detalhes">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
