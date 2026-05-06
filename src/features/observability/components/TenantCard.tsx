import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HealthBadge } from "./HealthBadge";
import { SchemaBadge } from "./SchemaBadge";
import { PublicConfigBadge } from "./PublicConfigBadge";
import { formatDateTime } from "../utils/format-utils";
import type { TenantSnapshot } from "../types";
import type { TenantSchemaStatus } from "../model/schema-comparator";

interface TenantCardProps {
  readonly snapshot: TenantSnapshot;
  readonly schemaStatus: TenantSchemaStatus[];
}

export function TenantCard({ snapshot, schemaStatus }: TenantCardProps) {
  const navigate = useNavigate();
  const latestImport = snapshot.imports[0];
  const currentSchema = schemaStatus.find(x => x.tenantId === snapshot.client.id);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">
                {snapshot.client.nome_entidade}
              </h3>
              <HealthBadge client={snapshot.client} />
              <SchemaBadge clientId={snapshot.client.id} schemaStatus={schemaStatus} />
              <PublicConfigBadge client={snapshot.client} />
            </div>
            <p className="text-sm text-muted-foreground">{snapshot.client.supabase_url}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/clients/${snapshot.client.id}`)}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Schema</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {(() => {
                if (!currentSchema) return "Pendente";
                if (currentSchema.totalDiffs === 0) return "Alinhado";
                return `${currentSchema.totalDiffs} Diverg.`;
              })()}
            </p>
            <p className="text-xs text-muted-foreground">
              {(() => {
                if (!currentSchema) return "Aguardando auditoria";
                if (currentSchema.totalDiffs === 0) return "100% Sincronizado";
                return "Requer atenção";
              })()}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Último health check</p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {formatDateTime(snapshot.client.last_health_check_at)}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {snapshot.client.health_error_detail ?? "Sem erros recentes"}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Importações</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{snapshot.imports.length}</p>
            <p className="text-xs text-muted-foreground truncate">
              {latestImport
                ? `${latestImport.tabela} · ${formatDateTime(latestImport.created_at)}`
                : "Sem histórico"}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => navigate(`/clients/${snapshot.client.id}`)}
          className="w-full sm:w-auto"
        >
          Ver detalhes do tenant
        </Button>
      </div>
    </Card>
  );
}
