import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle, Sprout, Fish } from "lucide-react";
import { differenceInDays, isPast } from "date-fns";
import { formatDate } from "@/shared/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Cliente } from "../types";
import { TOPOLOGY_LABEL } from "../types";
import type { RuntimeProjectMetadata } from "@/services/runtime-tenants.service";
import { proxyAction } from "@/services/projects.service";

function InfoCell({ label, children, full }: Readonly<{ label: string; children: ReactNode; full?: boolean }>) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

interface ClienteCommercialCardProps {
  projectId: string;
  cliente: Cliente;
  runtimeMetadata: RuntimeProjectMetadata | null;
  onSyncRuntime: () => void;
  isSyncingRuntime: boolean;
}

export function ClienteCommercialCard({
  projectId,
  cliente,
  runtimeMetadata,
  onSyncRuntime,
  isSyncingRuntime,
}: Readonly<ClienteCommercialCardProps>) {
  const queryClient = useQueryClient();
  const effectiveRuntimeMetadata = runtimeMetadata ?? {
    runtime_tenant_id: cliente.runtime_tenant_id,
    runtime_tenants_count: cliente.runtime_tenants_count ?? 0,
    runtime_units_count: cliente.runtime_units_count ?? 0,
    supports_units: cliente.supports_units,
    runtime_topology: cliente.runtime_topology,
  };

  const tenantId = effectiveRuntimeMetadata.runtime_tenant_id;

  const expiresAt = cliente.acesso_expira_em ? new Date(cliente.acesso_expira_em) : null;
  const expired = expiresAt ? isPast(expiresAt) : false;
  const daysLeft = expiresAt ? differenceInDays(expiresAt, new Date()) : null;

  const planLabel = { trial: "Trial", monthly: "Mensal", annual: "Anual" }[cliente.assinatura];
  const statusColor = {
    active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    inactive: "bg-secondary text-muted-foreground",
    suspended: "bg-destructive/10 text-destructive",
  }[cliente.status];
  const statusLabel = { active: "Ativo", inactive: "Inativo", suspended: "Suspenso" }[cliente.status];

  const tenantModeQuery = useQuery({
    queryKey: ["tenant-mode", projectId, tenantId],
    queryFn: () => proxyAction(projectId, "get-tenant-mode", { tenantId }),
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const [editingMode, setEditingMode] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'pesca' | 'agricultura'>('pesca');

  const updateModeMutation = useMutation({
    mutationFn: () => proxyAction(projectId, "update-tenant-mode", { tenantId, tenantMode: selectedMode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-mode", projectId, tenantId] });
      toast.success(`Modalidade atualizada para ${selectedMode}.`);
      setEditingMode(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar modalidade.");
    },
  });

  const currentMode = (tenantModeQuery.data as any)?.tenantMode ?? 'pesca';

  const expiryEl = () => {
    if (!expiresAt) return <span className="text-muted-foreground">Sem expiração</span>;
    if (expired) return <span className="font-medium text-destructive">Expirado em {formatDate(expiresAt)}</span>;
    if (daysLeft !== null && daysLeft <= 30) {
      return <span className="font-medium text-amber-500">{formatDate(expiresAt)} — {daysLeft}d restantes</span>;
    }
    return <span>{formatDate(expiresAt)}</span>;
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Dados Comerciais
        </p>
        <Button variant="outline" size="sm" onClick={onSyncRuntime} disabled={isSyncingRuntime}>
          {isSyncingRuntime ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Sincronizar runtime
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <InfoCell label="Código">
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs">{cliente.tenant_code}</code>
        </InfoCell>

        <InfoCell label="Cadastrado em">
          {formatDate(cliente.data_cadastro)}
        </InfoCell>

        <InfoCell label="Status">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}>
            {cliente.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {statusLabel}
          </span>
        </InfoCell>

        <InfoCell label="Assinatura">
          <Badge variant="outline" className="text-[11px]">{planLabel}</Badge>
        </InfoCell>

        <InfoCell label="Acesso expira">
          {expiryEl()}
        </InfoCell>

        <InfoCell label="Limite de sócios">
          {cliente.max_socios === 0 ? <span className="text-destructive">Bloqueado</span> : cliente.max_socios}
        </InfoCell>

        <InfoCell label="Polos">
          {cliente.supports_units ? "Com polos" : "Sem polos"}
        </InfoCell>

        <InfoCell label="Modalidade">
          {!tenantId ? (
            <span className="text-amber-600 text-xs">Indisponível — sincronize o runtime primeiro</span>
          ) : tenantModeQuery.isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : editingMode ? (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="text-xs border rounded px-2 py-1 bg-background"
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value as 'pesca' | 'agricultura')}
              >
                <option value="pesca">Pesca</option>
                <option value="agricultura">Agricultura</option>
              </select>
              <Button size="sm" className="h-6 text-xs px-2" onClick={() => updateModeMutation.mutate()} disabled={updateModeMutation.isPending}>
                {updateModeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingMode(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-sm">
                {currentMode === 'agricultura' ? <Sprout className="h-3.5 w-3.5 text-green-600" /> : <Fish className="h-3.5 w-3.5 text-blue-600" />}
                {currentMode === 'agricultura' ? 'Agricultura' : 'Pesca'}
              </span>
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground"
                onClick={() => { setSelectedMode(currentMode); setEditingMode(true); }}>
                Editar
              </Button>
            </div>
          )}
        </InfoCell>

        {cliente.email && (
          <InfoCell label="E-mail">{cliente.email}</InfoCell>
        )}

        {cliente.telefone && (
          <InfoCell label="Telefone">{cliente.telefone}</InfoCell>
        )}

        {cliente.cnpj_cpf && (
          <InfoCell label="CNPJ / CPF">{cliente.cnpj_cpf}</InfoCell>
        )}

        <InfoCell label="Tenant ID" full>
          {effectiveRuntimeMetadata.runtime_tenant_id ? (
            <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs font-mono break-all">
              {effectiveRuntimeMetadata.runtime_tenant_id}
            </code>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">Não sincronizado</span>
          )}
        </InfoCell>

        <InfoCell label="Runtime" full>
          {effectiveRuntimeMetadata.runtime_topology ? (
            <span>
              {TOPOLOGY_LABEL[effectiveRuntimeMetadata.runtime_topology]} — {effectiveRuntimeMetadata.runtime_tenants_count} tenant(s) — {effectiveRuntimeMetadata.runtime_units_count} unit(s)
            </span>
          ) : (
            <span className="text-muted-foreground">Sem snapshot</span>
          )}
        </InfoCell>
      </div>
    </Card>
  );
}
