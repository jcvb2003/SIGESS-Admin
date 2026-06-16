import type { ReactNode } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { differenceInDays, isPast } from "date-fns";
import { formatDate } from "@/shared/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Cliente } from "../types";
import { TOPOLOGY_LABEL } from "../types";
import type { RuntimeProjectMetadata } from "@/services/runtime-tenants.service";

function InfoRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 py-2.5 last:border-0">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="text-right text-sm text-foreground">{children}</div>
    </div>
  );
}

interface ClienteCommercialCardProps {
  cliente: Cliente;
  runtimeMetadata: RuntimeProjectMetadata | null;
  onSyncRuntime: () => void;
  isSyncingRuntime: boolean;
}

export function ClienteCommercialCard({
  cliente,
  runtimeMetadata,
  onSyncRuntime,
  isSyncingRuntime,
}: Readonly<ClienteCommercialCardProps>) {
  const effectiveRuntimeMetadata = runtimeMetadata ?? {
    runtime_tenant_id: cliente.runtime_tenant_id,
    runtime_tenants_count: cliente.runtime_tenants_count ?? 0,
    runtime_units_count: cliente.runtime_units_count ?? 0,
    supports_units: cliente.supports_units,
    runtime_topology: cliente.runtime_topology,
  };

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

  const expiryEl = () => {
    if (!expiresAt) return <span className="text-muted-foreground">Sem expiracao</span>;
    if (expired) {
      return <span className="font-medium text-destructive">Expirado em {format(expiresAt, "dd/MM/yyyy")}</span>;
    }
    if (daysLeft !== null && daysLeft <= 30) {
      return (
        <span className="font-medium text-amber-500">
          {format(expiresAt, "dd/MM/yyyy")} - {daysLeft}d restantes
        </span>
      );
    }
    return <span>{format(expiresAt, "dd/MM/yyyy", { locale: ptBR })}</span>;
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
      <p className="mb-3 text-xs text-muted-foreground">
        Sincroniza o snapshot do projeto runtime. Em projetos compartilhados, nao altera o vinculo tenant-a-tenant salvo no Admin.
      </p>
      <div className="divide-y divide-border/40">
        <InfoRow label="Codigo">
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs">{cliente.tenant_code}</code>
        </InfoRow>
        <InfoRow label="Tenant ID">
          {effectiveRuntimeMetadata.runtime_tenant_id ? (
            <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs font-mono">{effectiveRuntimeMetadata.runtime_tenant_id}</code>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">Nao sincronizado</span>
          )}
        </InfoRow>
        <InfoRow label="Runtime">
          {effectiveRuntimeMetadata.runtime_topology ? (
            <span>
              {TOPOLOGY_LABEL[effectiveRuntimeMetadata.runtime_topology]} - {effectiveRuntimeMetadata.runtime_tenants_count} tenant(s) - {effectiveRuntimeMetadata.runtime_units_count} unit(s)
            </span>
          ) : (
            <span className="text-muted-foreground">Sem snapshot</span>
          )}
        </InfoRow>
        <InfoRow label="Polos">{cliente.supports_units ? "Com polos" : "Sem polos"}</InfoRow>
        <InfoRow label="Assinatura">
          <Badge variant="outline" className="text-[11px]">{planLabel}</Badge>
        </InfoRow>
        <InfoRow label="Status">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}>
            {cliente.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {statusLabel}
          </span>
        </InfoRow>
        <InfoRow label="Acesso expira">{expiryEl()}</InfoRow>
        <InfoRow label="Limite de socios">
          {cliente.max_socios === 0 ? <span className="text-destructive">Bloqueado</span> : cliente.max_socios}
        </InfoRow>
        {cliente.email && <InfoRow label="E-mail">{cliente.email}</InfoRow>}
        {cliente.telefone && <InfoRow label="Telefone">{cliente.telefone}</InfoRow>}
        {cliente.cnpj_cpf && <InfoRow label="CNPJ / CPF">{cliente.cnpj_cpf}</InfoRow>}
        <InfoRow label="Cadastrado em">
          {formatDate(cliente.data_cadastro)}
        </InfoRow>
      </div>
    </Card>
  );
}
