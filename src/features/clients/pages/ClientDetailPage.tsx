import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, HardDrive, Table, Loader2, RefreshCw, AlertCircle, Pencil, Rocket, Trash2, Info, Settings2, Eye, EyeOff, ShieldCheck } from "lucide-react";
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
  DeleteClientDialog,
  useDeleteClient,
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

interface ClientMember {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  acesso_expira_em: string | null;
  max_socios: number | null;
}

interface TableInfo {
  name: string;
  schema: string;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const { data: client, isLoading, refetch: refetchClient } = useClientDetail(id!);
  const deleteClientMutation = useDeleteClient();

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

  // Query for users
  const { data: users = [] } = useQuery({
    queryKey: ["client-users", id],
    queryFn: async () => {
      const data = await proxyAction(id!, "list-client-members");
      return (data.users || []).map((u: Record<string, unknown>) => ({
        id: u.id as string,
        email: (u.email as string) || "Sem email",
        created_at: u.created_at as string,
        last_sign_in_at: (u.last_sign_in_at as string) || null,
        acesso_expira_em: (u.acesso_expira_em as string) || null,
        max_socios: (u.max_socios as number) || null,
      })) as ClientMember[];
    },
    enabled: !!client,
    staleTime: 1000 * 60 * 5,
  });

  // Query for tables
  const { data: tables = [] } = useQuery({
    queryKey: ["client-tables", id],
    queryFn: async () => {
      const data = await proxyAction(id!, "list-tables");
      let rawList: Array<{ name?: string; table_name?: string; schema?: string } | string> = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && typeof data === 'object' && 'definitions' in data) {
        rawList = Object.keys(data.definitions).map(name => ({ name, schema: "public" }));
      }
      return rawList.map((t) => ({
        name: typeof t === 'string' ? t : (t.name || (t as Record<string, unknown>).table_name as string || ""),
        schema: (typeof t === 'object' && (t as Record<string, unknown>).schema as string) || "public"
      })).filter((t: TableInfo) => t.name);
    },
    enabled: !!client,
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Invalidate all queries related to this client
      await Promise.all([
        refetchClient(),
        queryClient.invalidateQueries({ queryKey: ['client-buckets', id] }),
        queryClient.invalidateQueries({ queryKey: ['client-users', id] }),
        queryClient.invalidateQueries({ queryKey: ['client-tables', id] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (client) {
      await deleteClientMutation.mutateAsync(client.id);
      navigate("/clients");
    }
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

  const renderDetailsContent = () => {
    if (!client) return null;

    return (
      <div className="space-y-6 animate-fade-in-up">
        {/* Health Status Dashboard */}
        <div className="max-w-md">
          <HealthCheckCard clientId={client.id} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Informações Gerais
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">ID</span>
                <span className="text-sm col-span-2">{client.id}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">Nome</span>
                <span className="text-sm col-span-2 font-medium">{client.nome_entidade}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">Email</span>
                <span className="text-sm col-span-2">{client.email || 'Não informado'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">Telefone</span>
                <span className="text-sm col-span-2">{client.telefone || 'Não informado'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">Cadastro</span>
                <span className="text-sm col-span-2">{format(new Date(client.data_cadastro), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              Detalhes da Conta
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">Assinatura</span>
                <span className="text-sm col-span-2 capitalize">
                  <Badge variant={client.assinatura === 'trial' ? 'secondary' : 'default'}>{client.assinatura}</Badge>
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">Expira em</span>
                <span className="text-sm col-span-2">{client.acesso_expira_em ? format(new Date(client.acesso_expira_em), "dd/MM/yyyy") : 'Ilimitado'}</span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">Máx. Sócios</span>
                <span className="text-sm col-span-2">{client.max_socios ? client.max_socios : 'Ilimitado'}</span>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 space-y-4 md:col-span-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Supabase Configuração
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setShowKeys(!showKeys)}
              >
                {showKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showKeys ? "Ocultar Chaves" : "Revelar Chaves"}
              </Button>
            </div>
            
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-4 md:grid-cols-6 gap-4 border-b border-border/40 pb-3">
                <span className="text-sm font-medium text-muted-foreground col-span-1 pt-1">URL API</span>
                <span className="text-sm col-span-3 md:col-span-5 break-all font-mono bg-secondary/30 p-2 rounded selectable">{client.supabase_url}</span>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-4 border-b border-border/40 pb-3">
                <span className="text-sm font-medium text-muted-foreground col-span-1 pt-1">Anon Key</span>
                <span className="text-sm col-span-3 md:col-span-5 break-all font-mono text-xs bg-secondary/30 p-2 rounded">{client.supabase_publishable_key || 'Não definida'}</span>
              </div>
              <div className="grid grid-cols-4 md:grid-cols-6 gap-4 border-b border-border/40 pb-3">
                <span className="text-sm font-medium text-muted-foreground col-span-1 pt-1">Service Key</span>
                <span className="text-sm col-span-3 md:col-span-5 break-all font-mono text-xs bg-secondary/30 p-2 rounded">
                  {showKeys ? client.supabase_secret_keys : '••••••••••••' + client.supabase_secret_keys?.slice(-4)}
                </span>
              </div>
              {client.supabase_access_token && (
                <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
                <span className="text-sm font-medium text-muted-foreground col-span-1 pt-1">Access Token</span>
                <span className="text-sm col-span-3 md:col-span-5 break-all font-mono text-xs bg-secondary/30 p-2 rounded">
                  {showKeys ? client.supabase_access_token : '••••••••••••' + client.supabase_access_token?.slice(-4)}
                </span>
              </div>
              )}
            </div>
          </Card>
        </div>
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
            <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <Card className="p-4 bg-primary/5 border-primary/10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2"><HardDrive className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Buckets</p>
                <p className="text-xl font-bold text-foreground">{buckets.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-primary/5 border-primary/10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Usuários</p>
                <p className="text-xl font-bold text-foreground">{users.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-primary/5 border-primary/10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2"><Table className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Tabelas</p>
                <p className="text-xl font-bold text-foreground">{tables.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 flex flex-col justify-center bg-primary/5 border-primary/10">
            <p className="text-sm text-muted-foreground text-center">Cadastrado em</p>
            <p className="text-lg font-semibold text-center mt-auto">
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
        <Tabs defaultValue="configuracoes" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="configuracoes" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="storage" className="gap-2">
              <HardDrive className="h-4 w-4" />
              Storage ({buckets.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários ({users.length})
            </TabsTrigger>
            <TabsTrigger value="tables" className="gap-2">
              <Table className="h-4 w-4" />
              Tabelas ({tables.length})
            </TabsTrigger>
            <TabsTrigger value="migrations" className="gap-2">
              <Rocket className="h-4 w-4" />
              Migrações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configuracoes">
            {renderDetailsContent()}
          </TabsContent>

          <TabsContent value="storage">
            {renderStorageContent()}
          </TabsContent>

          <TabsContent value="users">
            <UsersTab
              clientId={client.id}
              connectionError={connectionError}
              onUsersLoaded={() => {}} // No longer needed for parent updates
            />
          </TabsContent>

          <TabsContent value="tables">
            <TablesTab
              clientId={client.id}
              connectionError={connectionError}
              onTablesLoaded={() => {}} // No longer needed for parent updates
            />
          </TabsContent>

          <TabsContent value="migrations">
            <MigrationsTab clientId={client.id} tables={tables} />
          </TabsContent>
        </Tabs>

        <EditClientModal
          client={client}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => refetchClient()}
        />

        <DeleteClientDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          clientName={client.nome_entidade}
          onConfirm={handleConfirmDelete}
        />
      </div>
    </MainLayout>
  );
}
