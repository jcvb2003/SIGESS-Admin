import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, ChevronRight, Layers, Loader2,
  Pencil, Plus, Users,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Cliente, Project } from "../types";
import { TOPOLOGY_LABEL } from "../types";
import { useProjectDetail } from "../hooks/useProjectDetail";
import { useClientes } from "../hooks/useClientes";
import { EditProjectModal } from "../components/EditProjectModal";
import { AddClienteDialog } from "../components/AddClienteDialog";
import { HealthCheckCard } from "@/features/clients";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractProjectRef(project: Project): string {
  try { return new URL(project.supabase_url).hostname.split(".")[0]; }
  catch { return "—"; }
}

function isIsolatedTopology(topology: Project["topology"]): boolean {
  return topology === "isolated_single" || topology === "isolated_polo";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfraCard({ project }: { project: Project }) {
  return (
    <Card className="p-5">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Infraestrutura
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-1">
          <p className="text-[10px] text-muted-foreground">Project Ref</p>
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs">{extractProjectRef(project)}</code>
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
  onClick,
}: {
  cliente: Cliente;
  onClick: () => void;
}) {
  const expiresAt = cliente.acesso_expira_em ? new Date(cliente.acesso_expira_em) : null;
  const expired   = expiresAt ? isPast(expiresAt) : false;
  const daysLeft  = expiresAt ? differenceInDays(expiresAt, new Date()) : null;

  const planLabel   = { trial: "Trial", monthly: "Mensal", annual: "Anual" }[cliente.assinatura];
  const planVariant = cliente.assinatura === "trial" ? "secondary" : "default";

  const expiryEl = () => {
    if (!expiresAt) return <span className="text-xs text-muted-foreground">Sem expiração</span>;
    if (expired)
      return (
        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
          Expirado em {format(expiresAt, "dd/MM/yyyy")}
        </span>
      );
    if (daysLeft !== null && daysLeft <= 30)
      return (
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
          {daysLeft}d restantes
        </span>
      );
    return <span className="text-xs text-muted-foreground">{format(expiresAt, "dd/MM/yyyy")}</span>;
  };

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center justify-between rounded-lg border border-border/50 px-4 py-3 hover:bg-secondary/30 hover:border-primary/30 transition-colors"
    >
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
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
          Defina a arquitetura do projeto antes de adicionar tenants.
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [addClienteOpen, setAddClienteOpen]   = useState(false);

  const { data: project, isLoading, refetch: refetchProject } = useProjectDetail(id!);
  const { data: clientes = [], refetch: refetchClientes }      = useClientes(id!);

  const isIsolated       = project ? isIsolatedTopology(project.topology) : false;
  const tenantCount      = clientes.length;
  const tenantsWithUnits = clientes.filter((c) => c.supports_units).length;

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
          <HealthCheckCard project={project} />
          <InfraCard project={project} />
        </div>

        {/* Não configurado */}
        {project.topology === "unconfigured" && (
          <UnconfiguredBanner onConfigure={() => setEditProjectOpen(true)} />
        )}

        {/* Lista de clientes */}
        {project.topology !== "unconfigured" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Tenants ({clientes.length})
              </h2>
              {(!isIsolated || clientes.length === 0) && (
                <Button size="sm" onClick={() => setAddClienteOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo Tenant
                </Button>
              )}
            </div>

            {clientes.length === 0 ? (
              <Card className="flex flex-col items-center justify-center gap-3 p-8 text-center border-dashed">
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nenhum tenant cadastrado neste projeto.</p>
                <Button size="sm" variant="outline" onClick={() => setAddClienteOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Adicionar primeiro tenant
                </Button>
              </Card>
            ) : (
              <div className="space-y-2">
                {clientes.map((c) => (
                  <ClienteRow
                    key={c.id}
                    cliente={c}
                    onClick={() => navigate(`/clients/${id}/clientes/${c.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modais */}
        <EditProjectModal
          project={project}
          open={editProjectOpen}
          onOpenChange={setEditProjectOpen}
          onUpdated={() => { refetchProject(); setEditProjectOpen(false); }}
          tenantCount={tenantCount}
          tenantsWithUnits={tenantsWithUnits}
        />

        <AddClienteDialog
          project={project}
          open={addClienteOpen}
          onOpenChange={setAddClienteOpen}
          onCreated={() => { refetchClientes(); setAddClienteOpen(false); }}
        />
      </div>
    </MainLayout>
  );
}
