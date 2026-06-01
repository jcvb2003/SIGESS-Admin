import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, ArrowLeft, Building2, Layers, Loader2,
  Pencil, Plus, Users,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Cliente, Project } from "../types";
import { TOPOLOGY_LABEL } from "../types";
import { useProjectDetail } from "../hooks/useProjectDetail";
import { useClientes } from "../hooks/useClientes";
import { EditProjectModal } from "../components/EditProjectModal";
import { AddClienteDialog } from "../components/AddClienteDialog";
import { EditClienteModal } from "../components/EditClienteModal";
import { HealthCheckCard, UsersTab, UnitsTab } from "@/features/clients";
import { proxyAction } from "@/services/projects.service";
import { listSharedTenants, listSharedTenantUnits } from "@/services/runtime-tenants.service";
import type { SharedTenant, TenantUnit } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractProjectRef(project: Project): string {
  try {
    return new URL(project.supabase_url).hostname.split(".")[0];
  } catch {
    return "—";
  }
}

function isSharedTopology(topology: Project["topology"]): boolean {
  return topology.startsWith("shared");
}

function hasPolos(topology: Project["topology"]): boolean {
  return topology === "isolated_polo" || topology === "shared_multi_polo" || topology === "shared_hybrid";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfraCard({ project }: { project: Project }) {
  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">Infraestrutura</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Project Ref</p>
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs">{extractProjectRef(project)}</code>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Código</p>
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs">{project.tenant_code}</code>
        </div>
        <div className="col-span-2 space-y-1">
          <p className="text-[10px] text-muted-foreground">Arquitetura</p>
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">{TOPOLOGY_LABEL[project.topology]}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ClienteRow({
  cliente,
  onEdit,
}: { cliente: Cliente; onEdit: (c: Cliente) => void }) {
  const expiresAt  = cliente.acesso_expira_em ? new Date(cliente.acesso_expira_em) : null;
  const expired    = expiresAt ? isPast(expiresAt) : false;
  const daysLeft   = expiresAt ? differenceInDays(expiresAt, new Date()) : null;

  const expiryEl = () => {
    if (!expiresAt) return <span className="text-xs text-muted-foreground">Sem expiração</span>;
    if (expired) return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        Expirado em {format(expiresAt, "dd/MM/yyyy")}
      </span>
    );
    if (daysLeft !== null && daysLeft <= 30) return (
      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
        {daysLeft}d restantes
      </span>
    );
    return <span className="text-xs text-muted-foreground">{format(expiresAt, "dd/MM/yyyy")}</span>;
  };

  const planLabel  = cliente.assinatura === "trial" ? "Trial" : cliente.assinatura === "monthly" ? "Mensal" : "Anual";
  const planVariant = cliente.assinatura === "trial" ? "secondary" : "default";

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 hover:bg-secondary/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {cliente.logo_url ? (
          <img src={cliente.logo_url} alt={cliente.nome_entidade} className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <span className="text-xs font-bold text-primary">{cliente.nome_entidade.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{cliente.nome_entidade}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <code className="text-[10px] text-muted-foreground">{cliente.tenant_code}</code>
            <Badge variant={planVariant} className="h-4 px-1.5 text-[10px]">{planLabel}</Badge>
            {cliente.status !== "active" && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{cliente.status}</Badge>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {expiryEl()}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(cliente)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function UnconfiguredBanner({ onConfigure }: { onConfigure: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-4 p-10 text-center border-dashed">
      <Layers className="h-10 w-10 text-muted-foreground/50" />
      <div>
        <p className="font-semibold text-foreground">Projeto não configurado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Defina a arquitetura do projeto antes de adicionar clientes.
        </p>
      </div>
      <Button onClick={onConfigure} variant="outline">
        <Pencil className="mr-2 h-4 w-4" />
        Configurar Projeto
      </Button>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [addClienteOpen, setAddClienteOpen]   = useState(false);
  const [editCliente, setEditCliente]         = useState<Cliente | null>(null);
  const [activeTenantId, setActiveTenantId]   = useState<string | null>(null);

  const { data: project, isLoading, refetch: refetchProject } = useProjectDetail(id!);
  const { data: clientes = [], refetch: refetchClientes }      = useClientes(id!);

  const isShared    = project ? isSharedTopology(project.topology) : false;
  const needsSelect = isShared && clientes.length > 1;
  const showUnits   = project ? hasPolos(project.topology) : false;

  const effectiveTenantId = needsSelect
    ? activeTenantId
    : (clientes[0]?.runtime_tenant_id ?? null);

  const { data: sharedTenants = [], isLoading: loadingTenants } = useQuery<SharedTenant[]>({
    queryKey:  ["shared-tenants-list"],
    enabled:   needsSelect,
    queryFn:   listSharedTenants,
    staleTime: 1000 * 60 * 10,
  });

  const { data: users = [] } = useQuery({
    queryKey:  ["client-users-count", id],
    enabled:   !!project && !isShared,
    staleTime: 1000 * 60 * 5,
    queryFn:   async () => {
      const data = await proxyAction(id!, "list-client-members");
      return (data.users || []) as { id: string; email: string | null; created_at: string; last_sign_in_at: string | null }[];
    },
  });

  const { data: sharedUnits = [], isLoading: loadingUnits } = useQuery<TenantUnit[]>({
    queryKey: ["shared-tenant-units", effectiveTenantId],
    enabled:  Boolean(project) && showUnits && Boolean(effectiveTenantId),
    queryFn:  () => listSharedTenantUnits(effectiveTenantId!),
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

  if (!project) {
    return (
      <MainLayout>
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h2 className="text-xl font-bold">Projeto não encontrado</h2>
          <Button variant="link" onClick={() => navigate("/clients")}>Voltar</Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/clients")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20">
              <span className="text-base font-bold text-primary">
                {project.project_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{project.project_name}</h1>
              <p className="text-xs text-muted-foreground">{TOPOLOGY_LABEL[project.topology]}</p>
            </div>
          </div>
          <Button onClick={() => setEditProjectOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar Projeto
          </Button>
        </div>

        {/* Info cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <HealthCheckCard clientId={project.id} client={project as any} />
          <InfraCard project={project} />
        </div>

        {/* Estado não configurado */}
        {project.topology === "unconfigured" && (
          <UnconfiguredBanner onConfigure={() => setEditProjectOpen(true)} />
        )}

        {/* Seletor de tenant (shared multi) */}
        {needsSelect && (
          <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-4 py-3 dark:border-violet-800/50 dark:bg-violet-950/20">
            <Building2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Tenant ativo</span>
            {loadingTenants ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Select value={activeTenantId ?? ""} onValueChange={setActiveTenantId}>
                <SelectTrigger className="h-8 w-56 text-sm">
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {sharedTenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} <span className="ml-1 text-xs text-muted-foreground">({t.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Clientes do projeto */}
        {project.topology !== "unconfigured" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Clientes ({clientes.length})
              </h2>
              <Button size="sm" onClick={() => setAddClienteOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Novo Cliente
              </Button>
            </div>
            {clientes.length === 0 ? (
              <Card className="flex flex-col items-center justify-center gap-3 p-8 text-center border-dashed">
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado neste projeto.</p>
                <Button size="sm" variant="outline" onClick={() => setAddClienteOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Adicionar primeiro cliente
                </Button>
              </Card>
            ) : (
              <div className="space-y-2">
                {clientes.map((c) => (
                  <ClienteRow key={c.id} cliente={c} onEdit={setEditCliente} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabs de operação */}
        {project.topology !== "unconfigured" && (
          <Tabs defaultValue={isShared ? "units" : "users"} className="space-y-4">
            <TabsList className="bg-secondary/50">
              {!isShared && (
                <TabsTrigger value="users" className="gap-2">
                  <Users className="h-4 w-4" />
                  Usuários ({users.length})
                </TabsTrigger>
              )}
              {showUnits && (
                <TabsTrigger value="units" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  Polos ({loadingUnits ? "…" : sharedUnits.length})
                </TabsTrigger>
              )}
            </TabsList>

            {!isShared && (
              <TabsContent value="users">
                <UsersTab clientId={project.id} connectionError={null} onUsersLoaded={() => {}} />
              </TabsContent>
            )}
            {showUnits && (
              <TabsContent value="units">
                {effectiveTenantId ? (
                  <UnitsTab tenantId={effectiveTenantId} />
                ) : (
                  <Card className="p-8 text-center text-muted-foreground text-sm">
                    Selecione um cliente para gerenciar os polos.
                  </Card>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        {/* Modais */}
        <EditProjectModal
          project={project}
          open={editProjectOpen}
          onOpenChange={setEditProjectOpen}
          onUpdated={() => { refetchProject(); setEditProjectOpen(false); }}
        />

        <AddClienteDialog
          project={project}
          open={addClienteOpen}
          onOpenChange={setAddClienteOpen}
          onCreated={() => { refetchClientes(); setAddClienteOpen(false); }}
        />

        {editCliente && (
          <EditClienteModal
            cliente={editCliente}
            project={project}
            open={!!editCliente}
            onOpenChange={(v) => { if (!v) setEditCliente(null); }}
            onUpdated={() => { refetchClientes(); setEditCliente(null); }}
            onDeleted={() => { refetchClientes(); setEditCliente(null); }}
          />
        )}
      </div>
    </MainLayout>
  );
}
