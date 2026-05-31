import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Layers,
  Loader2,
  Pencil,
  Shield,
  Users,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EditClientModal,
  HealthCheckCard,
  SubscriptionModal,
  UsersTab,
  SharedUsersTab,
  UnitsTab,
  MembershipsTab,
  useClientDetail,
} from "@/features/clients";
import {
  listSharedTenantUnits,
  listSharedTenantUsers,
  listSharedTenants,
  proxyAction,
} from "@/services/clients.service";
import type { Client, SharedTenant } from "@/features/clients/types";

interface ClientMember {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  acesso_expira_em: string | null;
  max_socios: number | null;
}

function extractProjectRef(client: Client): string {
  try {
    return new URL(client.supabase_url).hostname.split(".")[0];
  } catch {
    return "—";
  }
}

const DEPLOYMENT_LABEL: Record<string, string> = {
  isolated: "Isolado",
  shared:   "Compartilhado",
};

function InfraCard({ client }: { client: Client }) {
  const projectRef = extractProjectRef(client);
  const deployLabel = DEPLOYMENT_LABEL[client.deployment_mode] ?? client.deployment_mode;

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Infraestrutura
      </p>
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Supabase URL</p>
            <p className="break-all font-mono text-xs text-foreground">{client.supabase_url || "—"}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Project Ref</p>
            <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs text-foreground">
              {projectRef}
            </code>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground">Modo</p>
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">{deployLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ContaCard({ client }: { client: Client }) {
  const expiresAt = client.acesso_expira_em ? new Date(client.acesso_expira_em) : null;
  const expired   = expiresAt ? isPast(expiresAt) : false;
  const daysLeft  = expiresAt ? differenceInDays(expiresAt, new Date()) : null;

  const expiryEl = () => {
    if (!expiresAt) return <span className="text-sm text-muted-foreground">Sem expiração</span>;
    if (expired) return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <CalendarClock className="h-3 w-3" />
        Expirado em {format(expiresAt, "dd/MM/yyyy")}
      </span>
    );
    if (daysLeft !== null && daysLeft <= 30) return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
        <CalendarClock className="h-3 w-3" />
        {daysLeft}d restantes ({format(expiresAt, "dd/MM")})
      </span>
    );
    return <span className="text-sm text-foreground">{format(expiresAt, "dd/MM/yyyy")}</span>;
  };

  const planVariant =
    client.assinatura === "trial"    ? "secondary" :
    client.assinatura === "anual"    ? "default"   : "outline";

  const planLabel =
    client.assinatura === "trial"    ? "Trial" :
    client.assinatura === "anual"    ? "Anual" :
    client.assinatura === "mensal"   ? "Mensal" : client.assinatura;

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Conta
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Plano</p>
          <Badge variant={planVariant}>{planLabel}</Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Expiração</p>
          {expiryEl()}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Máx. sócios</p>
          <p className="text-sm font-medium text-foreground">
            {client.max_socios ?? "Ilimitado"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Cliente desde</p>
          <p className="text-sm font-medium text-foreground">
            {format(new Date(client.data_cadastro), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function ClientDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [editOpen, setEditOpen]               = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);

  const { data: client, isLoading, refetch: refetchClient } = useClientDetail(id!);

  const isSharedClient = client?.deployment_mode === "shared";
  const sharedMode     = client?.shared_mode ?? null;

  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const effectiveTenantId =
    sharedMode === "polo" ? (client?.shared_tenant_id ?? null) : activeTenantId;

  const needsTenantSelector = isSharedClient && sharedMode !== null && sharedMode !== "polo";
  const showUnitsTab        = isSharedClient && (sharedMode === "polo" || sharedMode === "multi_polo" || sharedMode === "hybrid");
  const showMembershipsTab  = showUnitsTab;

  const { data: sharedTenants = [], isLoading: isLoadingTenants } = useQuery<SharedTenant[]>({
    queryKey:  ["shared-tenants-list"],
    enabled:   needsTenantSelector,
    queryFn:   listSharedTenants,
    staleTime: 1000 * 60 * 10,
  });

  const { data: users = [] } = useQuery({
    queryKey:  ["client-users-count", id],
    enabled:   !!client && client.deployment_mode === "isolated",
    staleTime: 1000 * 60 * 5,
    queryFn:   async () => {
      const data = await proxyAction(id!, "list-client-members");
      return (data.users || []).map((u: Record<string, unknown>) => ({
        id:               u.id as string,
        email:            (u.email as string) || "Sem email",
        created_at:       u.created_at as string,
        last_sign_in_at:  (u.last_sign_in_at as string) || null,
        acesso_expira_em: (u.acesso_expira_em as string) || null,
        max_socios:       (u.max_socios as number) || null,
      })) as ClientMember[];
    },
  });

  const { data: sharedTenantUsers = [], isLoading: isLoadingSharedUsers } = useQuery({
    queryKey:  ["shared-tenant-users", effectiveTenantId],
    enabled:   Boolean(client) && isSharedClient && Boolean(effectiveTenantId),
    queryFn:   () => listSharedTenantUsers(effectiveTenantId!),
    staleTime: 1000 * 60 * 5,
  });

  const { data: sharedUnits = [], isLoading: isLoadingSharedUnits } = useQuery({
    queryKey:  ["shared-tenant-units", effectiveTenantId],
    enabled:   Boolean(client) && isSharedClient && showUnitsTab && Boolean(effectiveTenantId),
    queryFn:   () => listSharedTenantUnits(effectiveTenantId!),
    staleTime: 1000 * 60 * 5,
  });

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
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h2 className="text-xl font-bold">Cliente não encontrado</h2>
          <Button variant="link" onClick={() => navigate("/clients")}>
            Voltar para a lista
          </Button>
        </div>
      </MainLayout>
    );
  }

  const usersCount = isSharedClient ? sharedTenantUsers.length : users.length;

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/clients")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>

            {client.logo_url ? (
              <img
                src={client.logo_url}
                alt={client.nome_entidade}
                className="h-11 w-11 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                <span className="text-base font-bold text-primary">
                  {client.nome_entidade.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-foreground">
                {client.nome_entidade}
              </h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {client.tenant_code}
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
            <Button variant="outline" onClick={() => setSubscriptionOpen(true)}>
              <CreditCard className="mr-2 h-4 w-4" />
              Assinatura
            </Button>
          </div>
        </div>

        {/* ── Inline cards ── */}
        <div className="grid gap-4 md:grid-cols-3">
          <HealthCheckCard clientId={client.id} client={client} />
          <ContaCard client={client} />
          <InfraCard client={client} />
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue={isSharedClient ? "shared-users" : "users"} className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <TabsList className="bg-secondary/50">
              {client.deployment_mode === "isolated" ? (
                <TabsTrigger value="users" className="gap-2">
                  <Users className="h-4 w-4" />
                  Usuários ({users.length})
                </TabsTrigger>
              ) : (
                <>
                  <TabsTrigger value="shared-users" className="gap-2">
                    <Users className="h-4 w-4" />
                    Usuários ({isLoadingSharedUsers ? "…" : usersCount})
                  </TabsTrigger>
                  {showUnitsTab && (
                    <TabsTrigger value="units" className="gap-2">
                      <Building2 className="h-4 w-4" />
                      Polos ({isLoadingSharedUnits ? "…" : sharedUnits.length})
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

            {/* Tenant selector — integrado à linha das tabs */}
            {needsTenantSelector && (
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                {isLoadingTenants ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Select value={activeTenantId ?? ""} onValueChange={setActiveTenantId}>
                    <SelectTrigger className="h-8 w-48 text-sm">
                      <SelectValue placeholder="Selecione um tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {sharedTenants.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}{" "}
                          <span className="ml-1 text-xs text-muted-foreground">({t.code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          {/* Tab contents */}
          {client.deployment_mode === "isolated" ? (
            <TabsContent value="users">
              <UsersTab clientId={client.id} connectionError={null} onUsersLoaded={() => {}} />
            </TabsContent>
          ) : (
            <>
              <TabsContent value="shared-users">
                {effectiveTenantId ? (
                  <SharedUsersTab tenantId={effectiveTenantId} />
                ) : (
                  <Card className="p-8 text-center text-muted-foreground text-sm">
                    {needsTenantSelector
                      ? "Selecione um tenant no seletor ao lado das tabs para gerenciar usuários."
                      : "Defina o shared_tenant_id deste cliente via Editar para habilitar esta aba."}
                  </Card>
                )}
              </TabsContent>
              {showUnitsTab && (
                <TabsContent value="units">
                  {effectiveTenantId ? (
                    <UnitsTab tenantId={effectiveTenantId} />
                  ) : (
                    <Card className="p-8 text-center text-muted-foreground text-sm">
                      Selecione um tenant no seletor ao lado das tabs.
                    </Card>
                  )}
                </TabsContent>
              )}
              {showMembershipsTab && (
                <TabsContent value="memberships">
                  {effectiveTenantId ? (
                    <MembershipsTab tenantId={effectiveTenantId} units={sharedUnits} />
                  ) : (
                    <Card className="p-8 text-center text-muted-foreground text-sm">
                      Selecione um tenant no seletor ao lado das tabs.
                    </Card>
                  )}
                </TabsContent>
              )}
            </>
          )}
        </Tabs>

        {/* ── Modais ── */}
        <EditClientModal
          client={client}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => refetchClient()}
          onDeleted={() => navigate("/clients")}
        />

        <SubscriptionModal
          client={client}
          open={subscriptionOpen}
          onOpenChange={setSubscriptionOpen}
          onUpdated={() => refetchClient()}
        />
      </div>
    </MainLayout>
  );
}
