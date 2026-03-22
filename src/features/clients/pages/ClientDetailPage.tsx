import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, HardDrive, Table, Loader2, RefreshCw, AlertCircle, Pencil, Rocket } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  useClientDetail, 
  EditClientModal, 
  HealthCheckCard, 
  TablesTab, 
  UsersTab, 
  MigrationsTab 
} from "@/features/clients";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { proxyAction } from "@/services/clients.service";

interface StorageBucket {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [usersCount, setUsersCount] = useState(0);
  const [tablesCount, setTablesCount] = useState(0);
  
  const { data: client, isLoading, refetch: refetchClient } = useClientDetail(id!);

  // Independent query for buckets using the secure Proxy
  const { 
    data: buckets = [], 
    isLoading: isLoadingBuckets, 
    error: bucketError
  } = useQuery({
    queryKey: ['client-buckets', id],
    enabled: !!client,
    queryFn: () => proxyAction(id!, "list-buckets"),
    retry: false,
    staleTime: 1000 * 60 * 10, // 10 minutes cache
  });

  const handleRefresh = async () => {
    // Invalidate all queries related to this client
    await Promise.all([
      refetchClient(),
      queryClient.invalidateQueries({ queryKey: ['client-buckets', id] }),
      queryClient.invalidateQueries({ queryKey: ['client-users', id] }),
      queryClient.invalidateQueries({ queryKey: ['client-tables', id] }),
    ]);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!client) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <AlertCircle className="h-8 w-8 text-destructive mb-4" />
          <h2 className="text-xl font-bold">Cliente não encontrado</h2>
          <Button variant="link" onClick={() => navigate("/clients")}>Voltar para a lista</Button>
        </div>
      </MainLayout>
    );
  }

  const connectionError = bucketError instanceof Error ? bucketError.message : null;

  const renderStorageContent = () => {
    if (isLoadingBuckets) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }

    if (buckets.length === 0) {
      return (
        <Card className="p-12 text-center">
          <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground">Nenhum bucket encontrado</p>
          <p className="text-muted-foreground">
            {connectionError ? "Verifique a conexão" : "Este projeto não possui buckets de storage"}
          </p>
        </Card>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {buckets.map((bucket: StorageBucket) => (
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
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              {client.logo_url ? (
                <img src={client.logo_url} alt={client.nome_entidade} className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
                  <span className="text-lg font-bold text-primary">{client.nome_entidade.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-foreground">{client.nome_entidade}</h1>
                <p className="text-sm text-muted-foreground">{client.supabase_url}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <HealthCheckCard clientId={client.id} />
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2"><HardDrive className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Buckets</p>
                <p className="text-xl font-bold text-foreground">{buckets.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Usuários</p>
                <p className="text-xl font-bold text-foreground">{usersCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2"><Table className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Tabelas</p>
                <p className="text-xl font-bold text-foreground">{tablesCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 flex flex-col justify-center">
            <p className="text-sm text-muted-foreground text-center">Cadastrado em</p>
            <p className="text-lg font-semibold text-foreground text-center">
              {format(new Date(client.data_cadastro), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </Card>
        </div>

        {connectionError && (
          <Card className="p-4 border-destructive/50 bg-destructive/10">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">Não foi possível conectar ao projeto do cliente via Proxy.</p>
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
              Usuários ({usersCount})
            </TabsTrigger>
            <TabsTrigger value="tables" className="gap-2">
              <Table className="h-4 w-4" />
              Tabelas ({tablesCount})
            </TabsTrigger>
            <TabsTrigger value="migrations" className="gap-2">
              <Rocket className="h-4 w-4" />
              Migrações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="storage">
            {renderStorageContent()}
          </TabsContent>

          <TabsContent value="users">
            <UsersTab
              clientId={client.id}
              connectionError={connectionError}
              onUsersLoaded={setUsersCount}
            />
          </TabsContent>

          <TabsContent value="tables">
            <TablesTab 
              clientId={client.id}
              connectionError={connectionError}
              onTablesLoaded={setTablesCount}
            />
          </TabsContent>

          <TabsContent value="migrations">
            <MigrationsTab />
          </TabsContent>
        </Tabs>

        <EditClientModal
          client={client}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => refetchClient()}
        />
      </div>
    </MainLayout>
  );
}
