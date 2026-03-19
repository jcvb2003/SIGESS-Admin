import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, HardDrive, Table, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Client } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@supabase/supabase-js";

interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
}

interface ClientUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<StorageBucket[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    fetchClient();
  }, [id]);

  const fetchClient = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from("entidades")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        toast.error("Cliente não encontrado");
        navigate("/clients");
        return;
      }

      setClient(data);
      fetchClientData(data);
    } catch (error: any) {
      toast.error("Erro ao carregar cliente: " + error.message);
      navigate("/clients");
    } finally {
      setLoading(false);
    }
  };

  const fetchClientData = async (clientData: Client) => {
    setConnectionError(null);
    await Promise.all([
      fetchBuckets(clientData),
      fetchUsers(clientData),
    ]);
  };

  const fetchBuckets = async (clientData: Client) => {
    setLoadingBuckets(true);
    try {
      const clientSupabase = createClient(
        clientData.supabase_url,
        clientData.supabase_secret_keys
      );

      const { data, error } = await clientSupabase.storage.listBuckets();

      if (error) throw error;
      setBuckets(data || []);
    } catch (error: any) {
      console.error("Error fetching buckets:", error);
      setConnectionError("Não foi possível conectar ao projeto do cliente. Verifique as credenciais.");
      setBuckets([]);
    } finally {
      setLoadingBuckets(false);
    }
  };

  const fetchUsers = async (clientData: Client) => {
    setLoadingUsers(true);
    try {
      const clientSupabase = createClient(
        clientData.supabase_url,
        clientData.supabase_secret_keys,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

      const { data, error } = await clientSupabase.auth.admin.listUsers();

      if (error) throw error;
      
      setUsers(
        (data.users || []).map((u) => ({
          id: u.id,
          email: u.email || "Sem email",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at || null,
        }))
      );
    } catch (error: any) {
      console.error("Error fetching users:", error);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleRefresh = () => {
    if (client) {
      fetchClientData(client);
      toast.success("Dados atualizados");
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!client) {
    return null;
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/clients")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              {client.logo_url ? (
                <img
                  src={client.logo_url}
                  alt={client.nome_entidade}
                  className="h-12 w-12 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
                  <span className="text-lg font-bold text-primary">
                    {client.nome_entidade.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {client.nome_entidade}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {client.supabase_url}
                </p>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Buckets</p>
                <p className="text-xl font-bold text-foreground">{buckets.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usuários</p>
                <p className="text-xl font-bold text-foreground">{users.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Badge
                variant="default"
                className="bg-primary/20 text-primary border-primary/30"
              >
                {client.assinatura === "anual" ? "Anual" : "Mensal"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">Plano de assinatura</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Cadastrado em</p>
            <p className="text-lg font-semibold text-foreground">
              {format(new Date(client.data_cadastro), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </Card>
        </div>

        {/* Connection Error */}
        {connectionError && (
          <Card className="p-4 border-destructive/50 bg-destructive/10">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">{connectionError}</p>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="storage" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="storage" className="gap-2">
              <HardDrive className="h-4 w-4" />
              Storage ({buckets.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários ({users.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="storage">
            {loadingBuckets ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : buckets.length === 0 ? (
              <Card className="p-12 text-center">
                <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground">Nenhum bucket encontrado</p>
                <p className="text-muted-foreground">
                  {connectionError ? "Verifique a conexão" : "Este projeto não possui buckets de storage"}
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {buckets.map((bucket) => (
                  <Card key={bucket.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-secondary p-2">
                          <HardDrive className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{bucket.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(bucket.created_at), "dd/MM/yyyy")}
                          </p>
                        </div>
                      </div>
                      <Badge variant={bucket.public ? "default" : "secondary"}>
                        {bucket.public ? "Público" : "Privado"}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="users">
            {loadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : users.length === 0 ? (
              <Card className="p-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground">Nenhum usuário encontrado</p>
                <p className="text-muted-foreground">
                  {connectionError ? "Verifique a conexão" : "Este projeto não possui usuários cadastrados"}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <Card key={user.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                          <span className="text-sm font-bold text-primary">
                            {user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Criado em {format(new Date(user.created_at), "dd/MM/yyyy HH:mm")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        {user.last_sign_in_at ? (
                          <>
                            <p>Último acesso</p>
                            <p>{format(new Date(user.last_sign_in_at), "dd/MM/yyyy HH:mm")}</p>
                          </>
                        ) : (
                          <p>Nunca acessou</p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}