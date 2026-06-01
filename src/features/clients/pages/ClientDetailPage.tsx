import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CreditCard,
  Layers,
  Loader2,
  Pencil,
  PlusCircle,
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
  UnitsTab,
  useClientDetail,
} from "@/features/clients";
import { CreateSharedTenantDialog } from "@/features/clients/components/CreateSharedTenantDialog";
import {
  listSharedTenantUnits,
  listSharedTenants,
  proxyAction,
} from "@/services/clients.service";
import type { ClienteComProjeto, SharedTenant, Topology } from "@/features/clients/types";
import { TOPOLOGY_LABEL } from "@/features/clients/types";

interface ClientMember {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

const PLAN_LABEL: Record<string, string> = { annual: "Anual", monthly: "Mensal", trial: "Trial" };
const PLAN_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  trial:   "secondary",
  annual:  "default",
  monthly: "outline",
};

function topologyIsShared(t: Topology) { return t.startsWith("shared"); }
function topologyHasUnits(t: Topology) {
  return (["isolated_polo", "shared_multi_polo", "shared_hybrid"] as Topology[]).includes(t);
}
function topologyNeedsTenantSelector(t: Topology) {
  return (["shared_multi_single", "shared_multi_polo", "shared_hybrid"] as Topology[]).includes(t);
}

function InfraCard({ client }: { client: ClienteComProjeto }) {
  const { projetos: proj } = client;
  let projectRef = "—";
  try { projectRef = new URL(proj.supabase_url).hostname.split(".")[0]; } catch { /* noop */ }

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Infraestrutura
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Tenant Code</p>
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs text-foreground">
            {client.tenant_code}
          </code>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Project Ref</p>
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs text-foreground">
            {projectRef}
          </code>
        </div>
        <div className="space-y-1 col-span-2">
          <p className="text-[10px] text-muted-foreground">Topologia</p>
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">
              {TOPOLOGY_LABEL[proj.topology] ?? proj.topology}
            </span>
          </div>
        </div>
        {client.runtime_tenant_id && (
          <div className="space-y-1 col-span-2">
            <p className="text-[10px] text-muted-foreground">Runtime Tenant ID</p>
            <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs text-foreground break-all">
              {client.runtime_tenant_id}
            </code>
          </div>
        )}
      </div>
    </Card>
  );
}

function ContaCard({ client }: { client: ClienteComProjeto }) {
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

  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Conta
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Plano</p>
          <Badge variant={PLAN_VARIANT[client.assinatura] ?? "outline"}>
            {PLAN_LABEL[client.assinatura] ?? client.assinatura}
          </Badge>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Expiração</p>
          {expiryEl()}
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Máx. sócios</p>
          <p className="text-sm font-medium text-foreground">
            {client.max_socios > 0 ? client.max_socios : "Bloqueado"}
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

  const [editOpen, setEditOpen]                 = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [newTenantOpen, setNewTenantOpen]       = useState(false);

  const { data: client, isLoading, refetch: refetchClient } = useClientDetail(id!);

  const topology           = client?.projetos.topology ?? "unconfigured";
  const isShared           = topologyIsShared(topology);
  const showUnitsTab       = topologyHasUnits(topology);
  const needsTenantSelector = topologyNeedsTenantSelector(topology);

  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const effectiveTenantId = needsTenantSelector
    ? activeTenantId
    : (client?.runtime_tenant_id ?? null);

  const { data: sharedTenants = [], isLoading: isLoadingTenants } = useQuery<SharedTenant[]>({
    queryKey:  ["shared-tenants-list"],
    enabled:   needsTenantSelector,
    queryFn:   listSharedTenants,
    staleTime: 1000 * 60 * 10,
  });

  const { data: users = [] } = useQuery({
    queryKey:  ["client-users-count", id],
    enabled:   !!client && !isShared,
    staleTime: 1000 * 60 * 5,
    queryFn:   async () => {
      const data = await proxyAction(id!, "list-client-members");
      return (data.users || []).map((u: Record<string, unknown>) => ({
        id:              u.id as string,
        email:           (u.email as string) || "Sem email",
        created_at:      u.created_at as string,
        last_sign_in_at: (u.last_sign_in_at as string) || null,
      })) as ClientMember[];
    },
  });

  const { data: sharedUnits = [], isLoading: isLoadingSharedUnits } = useQuery({
    queryKey:  ["shared-tenant-units", effectiveTenantId],
    enabled:   Boolean(client) && showUnitsTab && Boolean(effectiveTenantId),
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

        {/* ── Cards ── */}
        <div className="grid gap-4 md:grid-cols-3">
          <HealthCheckCard clientId={client.project_id} />
          <ContaCard client={client} />
          <InfraCard client={client} />
        </div>

        {/* ── Tenant selector (shared multi) ── */}
        {needsTenantSelector && (
          <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-800/50 dark:bg-violet-950/20">
            <Building2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Tenant ativo</span>
            {isLoadingTenants ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Select value={activeTenantId ?? ""} onValueChange={setActiveTenantId}>
                <SelectTrigger className="h-8 w-56 text-sm">
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
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-900/40"
              onClick={() => setNewTenantOpen(true)}
            >
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Novo Tenant
            </Button>
          </div>
        )}

        {/* ── Tabs ── */}
        <Tabs defaultValue={isShared ? "units" : "users"} className="space-y-4">
          <TabsList className="bg-secondary/50">
            {!isShared ? (
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-4 w-4" />
                Usuários ({users.length})
              </TabsTrigger>
            ) : showUnitsTab && (
              <TabsTrigger value="units" className="gap-2">
                <Building2 className="h-4 w-4" />
                Polos ({isLoadingSharedUnits ? "…" : sharedUnits.length})
              </TabsTrigger>
            )}
          </TabsList>

          {!isShared ? (
            <TabsContent value="users">
              <UsersTab clientId={client.project_id} connectionError={null} onUsersLoaded={() => {}} />
            </TabsContent>
          ) : showUnitsTab && (
            <TabsContent value="units">
              {effectiveTenantId ? (
                <UnitsTab tenantId={effectiveTenantId} />
              ) : (
                <Card className="p-8 text-center text-muted-foreground text-sm">
                  {needsTenantSelector
                    ? "Selecione um tenant no seletor acima para gerenciar polos."
                    : "Defina o runtime_tenant_id deste cliente via Editar para habilitar esta aba."}
                </Card>
              )}
            </TabsContent>
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

        {isShared && (
          <CreateSharedTenantDialog
            clientId={client.id}
            open={newTenantOpen}
            onOpenChange={setNewTenantOpen}
            onCreated={(tenantId) => {
              setActiveTenantId(tenantId);
              refetchClient();
            }}
          />
        )}
      </div>
    </MainLayout>
  );
}
