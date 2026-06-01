import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, Building2, CheckCircle2,
  Loader2, Pencil, Users, XCircle,
} from "lucide-react";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectDetail } from "../hooks/useProjectDetail";
import { useClienteDetail } from "../hooks/useClienteDetail";
import { EditClienteModal } from "../components/EditClienteModal";
import { UsersTab, UnitsTab } from "@/features/clients";
import type { Cliente, Project } from "../types";

function hasPolos(topology: Project["topology"]): boolean {
  return (
    topology === "isolated_polo" ||
    topology === "shared_multi_polo" ||
    topology === "shared_hybrid"
  );
}

function isSharedTopology(topology: Project["topology"]): boolean {
  return topology.startsWith("shared");
}

// ── Commercial info card ──────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground shrink-0">
        {label}
      </span>
      <div className="text-sm text-foreground text-right">{children}</div>
    </div>
  );
}

function CommercialCard({ cliente }: { cliente: Cliente }) {
  const expiresAt = cliente.acesso_expira_em ? new Date(cliente.acesso_expira_em) : null;
  const expired   = expiresAt ? isPast(expiresAt) : false;
  const daysLeft  = expiresAt ? differenceInDays(expiresAt, new Date()) : null;

  const planLabel = { trial: "Trial", monthly: "Mensal", annual: "Anual" }[cliente.assinatura];
  const statusColor = {
    active:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    inactive:  "bg-secondary text-muted-foreground",
    suspended: "bg-destructive/10 text-destructive",
  }[cliente.status];
  const statusLabel = { active: "Ativo", inactive: "Inativo", suspended: "Suspenso" }[cliente.status];

  const expiryEl = () => {
    if (!expiresAt) return <span className="text-muted-foreground">Sem expiração</span>;
    if (expired)
      return (
        <span className="text-destructive font-medium">
          Expirado em {format(expiresAt, "dd/MM/yyyy")}
        </span>
      );
    if (daysLeft !== null && daysLeft <= 30)
      return (
        <span className="text-amber-500 font-medium">
          {format(expiresAt, "dd/MM/yyyy")} · {daysLeft}d restantes
        </span>
      );
    return <span>{format(expiresAt, "dd/MM/yyyy", { locale: ptBR })}</span>;
  };

  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Dados Comerciais
      </p>
      <div className="divide-y divide-border/40">
        <InfoRow label="Código">
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs">{cliente.tenant_code}</code>
        </InfoRow>
        <InfoRow label="Assinatura">
          <Badge variant="outline" className="text-[11px]">{planLabel}</Badge>
        </InfoRow>
        <InfoRow label="Status">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}>
            {cliente.status === "active"
              ? <CheckCircle2 className="h-3 w-3" />
              : <XCircle className="h-3 w-3" />}
            {statusLabel}
          </span>
        </InfoRow>
        <InfoRow label="Acesso expira">{expiryEl()}</InfoRow>
        <InfoRow label="Limite de sócios">
          {cliente.max_socios === 0
            ? <span className="text-destructive">Bloqueado</span>
            : cliente.max_socios}
        </InfoRow>
        {cliente.email && <InfoRow label="E-mail">{cliente.email}</InfoRow>}
        {cliente.telefone && <InfoRow label="Telefone">{cliente.telefone}</InfoRow>}
        {cliente.cnpj_cpf && <InfoRow label="CNPJ / CPF">{cliente.cnpj_cpf}</InfoRow>}
        <InfoRow label="Cadastrado em">
          {format(new Date(cliente.data_cadastro), "dd/MM/yyyy", { locale: ptBR })}
        </InfoRow>
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClienteDetailPage() {
  const { id: projectId, clienteId } = useParams<{ id: string; clienteId: string }>();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);

  const { data: project, isLoading: loadingProject } = useProjectDetail(projectId!);
  const { data: cliente, isLoading: loadingCliente, refetch } = useClienteDetail(clienteId!);
  const { deleteCliente } = useClienteMutations();

  const isLoading = loadingProject || loadingCliente;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!project || !cliente) {
    return (
      <MainLayout>
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h2 className="text-xl font-bold">Tenant não encontrado</h2>
          <Button variant="link" onClick={() => navigate(`/clients/${projectId}`)}>
            Voltar ao projeto
          </Button>
        </div>
      </MainLayout>
    );
  }

  const showUnits  = hasPolos(project.topology);
  const isShared   = isSharedTopology(project.topology);
  const defaultTab = showUnits ? "units" : "users";

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => navigate(`/clients/${projectId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {cliente.logo_url ? (
              <img
                src={cliente.logo_url}
                alt={cliente.nome_entidade}
                className="h-11 w-11 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                <span className="text-base font-bold text-primary">
                  {cliente.nome_entidade.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{cliente.nome_entidade}</h1>
              <p className="text-xs text-muted-foreground">{project.project_name}</p>
            </div>
          </div>
          <Button onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Editar Tenant
          </Button>
        </div>

        {/* Commercial card */}
        <CommercialCard cliente={cliente} />

        {/* Tabs */}
        {project.topology !== "unconfigured" && (
          <Tabs defaultValue={defaultTab} className="space-y-4">
            <TabsList className="bg-secondary/50">
              {!isShared && (
                <TabsTrigger value="users" className="gap-2">
                  <Users className="h-4 w-4" />
                  Usuários
                </TabsTrigger>
              )}
              {showUnits && (
                <TabsTrigger value="units" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  Polos
                </TabsTrigger>
              )}
            </TabsList>

            {!isShared && (
              <TabsContent value="users">
                <UsersTab
                  clientId={projectId!}
                  connectionError={null}
                  onUsersLoaded={() => {}}
                />
              </TabsContent>
            )}

            {showUnits && (
              <TabsContent value="units">
                {cliente.runtime_tenant_id ? (
                  <UnitsTab tenantId={cliente.runtime_tenant_id} />
                ) : (
                  <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center border-dashed">
                    <Building2 className="h-7 w-7 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Este tenant ainda não possui um ID runtime associado.
                    </p>
                  </Card>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        {/* Edit modal */}
        <EditClienteModal
          cliente={cliente}
          project={project}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => { refetch(); setEditOpen(false); }}
          onDeleted={() => navigate(`/clients/${projectId}`)}
        />
      </div>
    </MainLayout>
  );
}
