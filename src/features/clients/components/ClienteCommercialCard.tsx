import { type ReactNode, useState } from "react";
import { CheckCircle2, Loader2, Pencil, RefreshCw, X, XCircle } from "lucide-react";
import { differenceInDays, isPast } from "date-fns";
import { formatDate } from "@/shared/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cliente } from "../types";
import { TOPOLOGY_LABEL } from "../types";
import type { RuntimeProjectMetadata } from "@/services/runtime-tenants.service";
import { useUpdateTenant } from "../hooks/useClienteMutations";

function InfoCell({ label, children, full }: Readonly<{ label: string; children: ReactNode; full?: boolean }>) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

interface ClienteCommercialCardProps {
  cliente: Cliente;
  projectId: string;
  runtimeMetadata: RuntimeProjectMetadata | null;
  onSyncRuntime: () => void;
  isSyncingRuntime: boolean;
}

export function ClienteCommercialCard({
  cliente,
  projectId,
  runtimeMetadata,
  onSyncRuntime,
  isSyncingRuntime,
}: Readonly<ClienteCommercialCardProps>) {
  const { mutate: update, isPending: isSaving } = useUpdateTenant(projectId);

  const [editingAssinatura, setEditingAssinatura] = useState(false);
  const [assinaturaVal, setAssinaturaVal] = useState(cliente.assinatura);

  const [editingExpira, setEditingExpira] = useState(false);
  const [expiraVal, setExpiraVal] = useState(
    cliente.acesso_expira_em ? cliente.acesso_expira_em.split('T')[0] : ''
  );

  const saveAssinatura = () => {
    update(
      { id: cliente.id, input: { assinatura: assinaturaVal } },
      { onSuccess: () => setEditingAssinatura(false) },
    );
  };

  const saveExpira = () => {
    update(
      { id: cliente.id, input: { acesso_expira_em: expiraVal ? new Date(expiraVal).toISOString() : null } },
      { onSuccess: () => setEditingExpira(false) },
    );
  };

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

  const expiryDisplay = () => {
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
          {editingAssinatura ? (
            <div className="flex items-center gap-1.5">
              <Select value={assinaturaVal} onValueChange={(v) => setAssinaturaVal(v as typeof assinaturaVal)}>
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveAssinatura} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs font-bold text-primary">✓</span>}
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingAssinatura(false); setAssinaturaVal(cliente.assinatura); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="group flex items-center gap-1.5">
              <Badge variant="outline" className="text-[11px]">{planLabel}</Badge>
              <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditingAssinatura(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
        </InfoCell>

        <InfoCell label="Acesso expira">
          {editingExpira ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                className="h-7 w-36 text-xs"
                value={expiraVal}
                onChange={(e) => setExpiraVal(e.target.value)}
              />
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveExpira} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs font-bold text-primary">✓</span>}
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingExpira(false); setExpiraVal(cliente.acesso_expira_em ? cliente.acesso_expira_em.split('T')[0] : ''); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="group flex items-center gap-1.5">
              {expiryDisplay()}
              <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setEditingExpira(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}
        </InfoCell>

        <InfoCell label="Limite de sócios">
          {cliente.max_socios === 0 ? <span className="text-destructive">Bloqueado</span> : cliente.max_socios}
        </InfoCell>

        <InfoCell label="Polos">
          {cliente.supports_units ? "Com polos" : "Sem polos"}
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
