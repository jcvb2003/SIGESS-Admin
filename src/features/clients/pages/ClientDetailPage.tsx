import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CreditCard,
  Eye,
  EyeOff,
  Globe2,
  HardDrive,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Rocket,
  Settings2,
  Table,
  Trash2,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DeleteClientDialog,
  EditClientModal,
  HealthCheckCard,
  SubscriptionModal,
  TablesTab,
  UsersTab,
  useClientDetail,
  useDeleteClient,
} from "@/features/clients";
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
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const { data: client, isLoading, refetch: refetchClient } = useClientDetail(id!);
  const deleteClientMutation = useDeleteClient();

  const {
    data: buckets = [],
    isLoading: isLoadingBuckets,
    error: bucketError,
  } = useQuery({
    queryKey: ["client-buckets", id],
    enabled: !!client,
    queryFn: () => proxyAction(id!, "list-buckets"),
    retry: false,
    staleTime: 1000 * 60 * 10,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["client-users-count", id],
    enabled: !!client,
    staleTime: 1000 * 60 * 5,
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
  });

  const { data: tables = [] } = useQuery({
    queryKey: ["client-tables", id],
    enabled: !!client,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const data = await proxyAction(id!, "list-tables");
      let rawList: Array<{ name?: string; table_name?: string; schema?: string } | string> = [];

      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && typeof data === "object" && "definitions" in data) {
        rawList = Object.keys(data.definitions).map((name) => ({ name, schema: "public" }));
      }

      return rawList
        .map((item) => ({
          name:
            typeof item === "string"
              ? item
              : item.name || ((item as Record<string, unknown>).table_name as string) || "",
          schema:
            (typeof item === "object" &&
              ((item as Record<string, unknown>).schema as string)) ||
            "public",
        }))
        .filter((item: TableInfo) => item.name);
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchClient(),
        queryClient.invalidateQueries({ queryKey: ["client-buckets", id] }),
        queryClient.invalidateQueries({ queryKey: ["client-users-count", id] }),
        queryClient.invalidateQueries({ queryKey: ["client-users", id] }),
        queryClient.invalidateQueries({ queryKey: ["client-tables", id] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!client) return;
    await deleteClientMutation.mutateAsync(client.id);
    navigate("/clients");
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!client) {
    return (
      <MainLayout>
        <div className="flex h-64 flex-col items-center justify-center">
          <AlertCircle className="mb-4 h-8 w-8 text-destructive" />
          <h2 className="text-xl font-bold">Cliente nao encontrado</h2>
          <Button variant="link" onClick={() => navigate("/clients")}>
            Voltar para a lista
          </Button>
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
          <HardDrive className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-medium text-foreground">Nenhum bucket encontrado</p>
          <p className="text-muted-foreground">
            {connectionError ? "Verifique a conexao" : "Este projeto nao possui buckets de storage"}
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
                {bucket.public ? "Publico" : "Privado"}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderDetailsContent = () => (
    <div className="space-y-6 animate-fade-in-up">
      <div className="max-w-md">
        <HealthCheckCard clientId={client.id} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="space-y-4 p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Info className="h-5 w-5 text-primary" />
            Informacoes Gerais
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">ID</span>
              <span className="col-span-2 text-sm">{client.id}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Nome</span>
              <span className="col-span-2 text-sm font-medium">{client.nome_entidade}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Email</span>
              <span className="col-span-2 text-sm">{client.email || "Nao informado"}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Telefone</span>
              <span className="col-span-2 text-sm">{client.telefone || "Nao informado"}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Cadastro</span>
              <span className="col-span-2 text-sm">
                {format(new Date(client.data_cadastro), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <HardDrive className="h-5 w-5 text-primary" />
            Detalhes da Conta
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Assinatura</span>
              <span className="col-span-2 text-sm capitalize">
                <Badge variant={client.assinatura === "trial" ? "secondary" : "default"}>
                  {client.assinatura}
                </Badge>
              </span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Expira em</span>
              <span className="col-span-2 text-sm">
                {client.acesso_expira_em
                  ? format(new Date(client.acesso_expira_em), "dd/MM/yyyy")
                  : "Ilimitado"}
              </span>
            </div>
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-sm font-medium text-muted-foreground">Max. socios</span>
              <span className="col-span-2 text-sm">
                {client.max_socios ? client.max_socios : "Ilimitado"}
              </span>
            </div>
          </div>
        </Card>

        <Card className="relative space-y-4 overflow-hidden p-6 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Rocket className="h-5 w-5 text-primary" />
              Supabase Configuracao
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
            <div className="grid grid-cols-4 gap-4 border-b border-border/40 pb-3 md:grid-cols-6">
              <span className="col-span-1 pt-1 text-sm font-medium text-muted-foreground">
                URL API
              </span>
              <span className="col-span-3 rounded bg-secondary/30 p-2 font-mono text-sm break-all selectable md:col-span-5">
                {client.supabase_url}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4 border-b border-border/40 pb-3 md:grid-cols-6">
              <span className="col-span-1 pt-1 text-sm font-medium text-muted-foreground">
                Anon Key
              </span>
              <span className="col-span-3 rounded bg-secondary/30 p-2 font-mono text-xs break-all md:col-span-5">
                {client.supabase_publishable_key || "Nao definida"}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4 border-b border-border/40 pb-3 md:grid-cols-6">
              <span className="col-span-1 pt-1 text-sm font-medium text-muted-foreground">
                Service Key
              </span>
              <span className="col-span-3 rounded bg-secondary/30 p-2 font-mono text-xs break-all md:col-span-5">
                {showKeys
                  ? client.supabase_secret_keys
                  : `************${client.supabase_secret_keys?.slice(-4) ?? ""}`}
              </span>
            </div>
            {client.supabase_access_token ? (
              <div className="grid grid-cols-4 gap-4 md:grid-cols-6">
                <span className="col-span-1 pt-1 text-sm font-medium text-muted-foreground">
                  Access Token
                </span>
                <span className="col-span-3 rounded bg-secondary/30 p-2 font-mono text-xs break-all md:col-span-5">
                  {showKeys
                    ? client.supabase_access_token
                    : `************${client.supabase_access_token.slice(-4)}`}
                </span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/clients")}>
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
            <Button variant="outline" onClick={() => setSubscriptionOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Assinatura
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <Card className="border-primary/10 bg-primary/5 p-4">
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
          <Card className="border-primary/10 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usuarios</p>
                <p className="text-xl font-bold text-foreground">{users.length}</p>
              </div>
            </div>
          </Card>
          <Card className="border-primary/10 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2">
                <Table className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tabelas</p>
                <p className="text-xl font-bold text-foreground">{tables.length}</p>
              </div>
            </div>
          </Card>
          <Card className="flex flex-col justify-center border-primary/10 bg-primary/5 p-4">
            <p className="text-center text-sm text-muted-foreground">Cadastrado em</p>
            <p className="mt-auto text-center text-lg font-semibold">
              {format(new Date(client.data_cadastro), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </Card>
        </div>

        {connectionError ? (
          <Card className="border-destructive/50 bg-destructive/10 p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">
                Nao foi possivel conectar ao projeto do cliente via Proxy.
              </p>
            </div>
          </Card>
        ) : null}

        <Card className="border-primary/20 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/15 p-2">
                <Globe2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  Migracoes e importacoes agora ficam na observabilidade global.
                </p>
                <p className="text-sm text-muted-foreground">
                  Use o centro de comando para acompanhar drift, historico operacional e sincronizacoes manuais deste tenant.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/observability")}>
              Abrir observabilidade
            </Button>
          </div>
        </Card>

        <Tabs defaultValue="configuracoes" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="configuracoes" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Configuracoes
            </TabsTrigger>
            <TabsTrigger value="storage" className="gap-2">
              <HardDrive className="h-4 w-4" />
              Storage ({buckets.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuarios ({users.length})
            </TabsTrigger>
            <TabsTrigger value="tables" className="gap-2">
              <Table className="h-4 w-4" />
              Tabelas ({tables.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configuracoes">{renderDetailsContent()}</TabsContent>
          <TabsContent value="storage">{renderStorageContent()}</TabsContent>
          <TabsContent value="users">
            <UsersTab
              clientId={client.id}
              connectionError={connectionError}
              onUsersLoaded={() => {}}
            />
          </TabsContent>
          <TabsContent value="tables">
            <TablesTab
              clientId={client.id}
              connectionError={connectionError}
              onTablesLoaded={() => {}}
            />
          </TabsContent>
        </Tabs>

        <EditClientModal
          client={client}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => refetchClient()}
        />

        <SubscriptionModal
          client={client}
          open={subscriptionOpen}
          onOpenChange={setSubscriptionOpen}
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
