import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Rocket,
  Settings2,
  Shield,
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
  PublicConfigCard,
  SubscriptionModal,
  UsersTab,
  SharedUsersTab,
  UnitsTab,
  MembershipsTab,
  useClientDetail,
  useDeleteClient,
} from "@/features/clients";
import { listSharedTenantUnits, listSharedTenantUsers, listSharedTenants, proxyAction } from "@/services/clients.service";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SharedTenant } from "@/features/clients/types";

interface ClientMember {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  acesso_expira_em: string | null;
  max_socios: number | null;
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
  const isSharedClient = client?.deployment_mode === "shared";
  const sharedMode = client?.shared_mode ?? null;
  // Para "polo": tenant único, usa shared_tenant_id diretamente.
  // Para "multi/multi_polo/hybrid": seletor de tenant; inicia null até seleção.
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const effectiveTenantId = sharedMode === "polo"
    ? (client?.shared_tenant_id ?? null)
    : activeTenantId;
  // Mantém compatibilidade com código legado que usava sharedTenantId
  const sharedTenantId = effectiveTenantId;

  const needsTenantSelector = isSharedClient && sharedMode !== null && sharedMode !== "polo";
  const showUnitsTab = isSharedClient && (sharedMode === "polo" || sharedMode === "multi_polo" || sharedMode === "hybrid");
  const showMembershipsTab = showUnitsTab;

  const { data: sharedTenants = [], isLoading: isLoadingTenants } = useQuery<SharedTenant[]>({
    queryKey: ["shared-tenants-list"],
    enabled: needsTenantSelector,
    queryFn: listSharedTenants,
    staleTime: 1000 * 60 * 10,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["client-users-count", id],
    enabled: !!client && client.deployment_mode === "isolated",
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

  const { data: sharedTenantUsers = [], isLoading: isLoadingSharedUsers } = useQuery({
    queryKey: ["shared-tenant-users", effectiveTenantId],
    enabled: Boolean(client) && isSharedClient && Boolean(effectiveTenantId),
    queryFn: () => listSharedTenantUsers(effectiveTenantId!),
    staleTime: 1000 * 60 * 5,
  });

  const { data: sharedUnits = [], isLoading: isLoadingSharedUnits } = useQuery({
    queryKey: ["shared-tenant-units", effectiveTenantId],
    enabled: Boolean(client) && isSharedClient && showUnitsTab && Boolean(effectiveTenantId),
    queryFn: () => listSharedTenantUnits(effectiveTenantId!),
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchClient(),
        queryClient.invalidateQueries({ queryKey: ["client-users-count", id] }),
        queryClient.invalidateQueries({ queryKey: ["client-users", id] }),
        ...(sharedTenantId
          ? [
              queryClient.invalidateQueries({ queryKey: ["shared-tenant-units", sharedTenantId] }),
              queryClient.invalidateQueries({ queryKey: ["shared-memberships", sharedTenantId] }),
              queryClient.invalidateQueries({ queryKey: ["shared-tenant-users", sharedTenantId] }),
            ]
          : []),
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

  const renderDetailsContent = () => (
    <div className="space-y-6 animate-fade-in-up">
      <div className="grid gap-4 md:grid-cols-2">
        <HealthCheckCard clientId={client.id} />
        <PublicConfigCard client={client} />
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
              <span className="text-sm font-medium text-muted-foreground">Modo</span>
              <span className="col-span-2 text-sm flex items-center gap-2">
                <Badge variant={client.deployment_mode === "shared" ? "default" : "secondary"}>
                  {client.deployment_mode}
                </Badge>
                {client.shared_mode && (
                  <Badge variant="outline" className="text-xs">
                    {client.shared_mode}
                  </Badge>
                )}
              </span>
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
            {client.deployment_mode === "shared" ? (
              <>
                <div className="grid grid-cols-3 items-center gap-4">
                  <span className="text-sm font-medium text-muted-foreground">Shared ref</span>
                  <span className="col-span-2 text-sm">{client.shared_project_ref || "Nao definido"}</span>
                </div>
                <div className="grid grid-cols-3 items-center gap-4">
                  <span className="text-sm font-medium text-muted-foreground">Shared tenant</span>
                  <span className="col-span-2 text-sm">{client.shared_tenant_id || "Nao vinculado"}</span>
                </div>
              </>
            ) : null}
          </div>
        </Card>

        {client.deployment_mode === "isolated" ? (
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
        ) : (
          <Card className="space-y-4 p-6 md:col-span-2">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Shield className="h-5 w-5 text-primary" />
              Ambiente Shared
            </h3>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Este tenant opera no novo modelo shared. A configuracao de acesso e estrutura
                acontece por polos e memberships, em vez de buckets e tabelas dedicadas por cliente.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Project ref</p>
                  <p className="font-medium text-foreground">{client.shared_project_ref || "Nao definido"}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Tenant id</p>
                  <p className="font-medium text-foreground">{client.shared_tenant_id || "Nao vinculado"}</p>
                </div>
              </div>
            </div>
          </Card>
        )}
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
                <p className="text-sm text-muted-foreground">
                  {client.deployment_mode === "shared" ? "Polos" : "Usuarios"}
                </p>
                <p className="text-xl font-bold text-foreground">
                  {client.deployment_mode === "shared" ? sharedUnits.length : users.length}
                </p>
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
                <p className="text-xl font-bold text-foreground">
                  {client.deployment_mode === "shared" ? sharedTenantUsers.length : users.length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="border-primary/10 bg-primary/5 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/20 p-2">
                {client.deployment_mode === "shared" ? (
                  <Shield className="h-5 w-5 text-primary" />
                ) : (
                  <Table className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Memberships</p>
                <p className="text-xl font-bold text-foreground">
                  {client.deployment_mode === "shared" ? sharedTenantUsers.length : "—"}
                </p>
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

        {needsTenantSelector && (
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Tenant ativo</p>
                {isLoadingTenants ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Carregando tenants...
                  </div>
                ) : (
                  <Select value={activeTenantId ?? ""} onValueChange={setActiveTenantId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecione um tenant para operar" />
                    </SelectTrigger>
                    <SelectContent>
                      {sharedTenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} <span className="text-muted-foreground ml-1 text-xs">({t.code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </Card>
        )}

        <Tabs defaultValue="configuracoes" className="space-y-4">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="configuracoes" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Configuracoes
            </TabsTrigger>
            {client.deployment_mode === "isolated" ? (
              <>
                <TabsTrigger value="users" className="gap-2">
                  <Users className="h-4 w-4" />
                  Usuarios ({users.length})
                </TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="shared-users" className="gap-2">
                  <Users className="h-4 w-4" />
                  Usuarios ({isLoadingSharedUsers ? "..." : sharedTenantUsers.length})
                </TabsTrigger>
                {showUnitsTab && (
                  <TabsTrigger value="units" className="gap-2">
                    <Building2 className="h-4 w-4" />
                    Polos ({isLoadingSharedUnits ? "..." : sharedUnits.length})
                  </TabsTrigger>
                )}
                {showMembershipsTab && (
                  <TabsTrigger value="memberships" className="gap-2">
                    <Shield className="h-4 w-4" />
                    Memberships
                  </TabsTrigger>
                )}
              </>
            )}
          </TabsList>

          <TabsContent value="configuracoes">{renderDetailsContent()}</TabsContent>
          {client.deployment_mode === "isolated" ? (
            <>
              <TabsContent value="users">
                <UsersTab
                  clientId={client.id}
                  connectionError={null}
                  onUsersLoaded={() => {}}
                />
              </TabsContent>
            </>
          ) : (
            <>
              <TabsContent value="shared-users">
                {effectiveTenantId ? (
                  <SharedUsersTab tenantId={effectiveTenantId} />
                ) : (
                  <Card className="p-8 text-center text-muted-foreground">
                    {needsTenantSelector
                      ? "Selecione um tenant no seletor acima para gerenciar usuarios."
                      : "Defina o shared_tenant_id deste cliente para habilitar a criacao do administrador inicial."}
                  </Card>
                )}
              </TabsContent>
              {showUnitsTab && (
                <TabsContent value="units">
                  {effectiveTenantId ? (
                    <UnitsTab tenantId={effectiveTenantId} />
                  ) : (
                    <Card className="p-8 text-center text-muted-foreground">
                      Selecione um tenant no seletor acima para gerenciar polos.
                    </Card>
                  )}
                </TabsContent>
              )}
              {showMembershipsTab && (
                <TabsContent value="memberships">
                  {effectiveTenantId ? (
                    <MembershipsTab tenantId={effectiveTenantId} units={sharedUnits} />
                  ) : (
                    <Card className="p-8 text-center text-muted-foreground">
                      Selecione um tenant no seletor acima para gerenciar memberships.
                    </Card>
                  )}
                </TabsContent>
              )}
            </>
          )}
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
