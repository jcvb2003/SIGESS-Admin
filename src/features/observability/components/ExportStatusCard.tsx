import { 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  Loader2, 
  XCircle 
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "../utils/format-utils";
import type { Client } from "@/features/clients";
import type { ExportRun } from "../types";

interface ExportStatusCardProps {
  readonly client: Client;
  readonly exportRuns: ExportRun[];
}

const TABELAS_EXPECTED = [
  'socios',
  'reap',
  'requerimentos',
  'financeiro_lancamentos',
  'financeiro_cobrancas_geradas',
  'financeiro_dae',
  'financeiro_historico_regime',
  'financeiro_config_socio',
  'localidades',
  'templates',
  'configuracao_entidade',
  'parametros',
  'logs_eventos_requerimento',
  'audit_log_financeiro',
];

export function ExportStatusCard({ client, exportRuns }: ExportStatusCardProps) {
  const clientRuns = exportRuns.filter(r => r.tenant_code === client.tenant_code);
  const latestRunId = clientRuns[0]?.run_id;
  const latestCycle = clientRuns.filter(r => r.run_id === latestRunId);
  
  const hasFailed = latestCycle.some(r => r.status === 'failed');
  const isRunning = latestCycle.some(r => r.status === 'running');
  const lastUpdate = latestCycle[0]?.executed_at;

  return (
    <Card className="p-5 overflow-hidden">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border/50 pb-3">
          <div className="space-y-1">
            <h3 className="font-semibold text-foreground">{client.nome_entidade}</h3>
            <p className="text-xs text-muted-foreground">
              Code: <code className="bg-secondary/40 px-1 rounded">{client.tenant_code}</code>
            </p>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            {(() => {
              if (hasFailed) return <Badge variant="destructive" className="animate-pulse">Ciclo com falhas</Badge>;
              if (isRunning) return <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50 animate-pulse">Em andamento</Badge>;
              if (latestCycle.length > 0) return <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50">Ciclo Saudável</Badge>;
              return <Badge variant="secondary">Sem registros</Badge>;
            })()}
            <p className="text-[10px] text-muted-foreground uppercase font-medium">
              {lastUpdate ? `Atualizado em ${formatDateTime(lastUpdate)}` : "Nunca executado"}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TABELAS_EXPECTED.map(tabela => {
            const run = latestCycle.find(r => r.tabela === tabela);
            const statusInfo = getStatusInfo(run);

            return (
              <div key={tabela} className={`flex items-center justify-between rounded-lg border p-2 text-xs transition-colors ${statusInfo.bgClass}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {statusInfo.StatusIcon}
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-foreground truncate">{tabela}</span>
                    {statusInfo.details && <span className={`truncate opacity-80 ${statusInfo.statusColor}`}>{statusInfo.details}</span>}
                  </div>
                </div>
                <span className={`font-semibold uppercase text-[10px] ${statusInfo.statusColor}`}>{statusInfo.statusText}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function getStatusInfo(run: ExportRun | undefined) {
  if (!run) {
    return {
      StatusIcon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
      statusText: "Sem dados",
      statusColor: "text-muted-foreground",
      bgClass: "bg-secondary/5",
      details: ""
    };
  }

  if (run.status === 'success') {
    const bytes = run.file_size_bytes || 0;
    let details = "0 B";
    if (bytes > 0) {
      details = bytes < 1024 ? "< 1 KB" : `${Math.round(bytes / 1024)} KB`;
    }
    
    return {
      StatusIcon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      statusText: "Sucesso",
      statusColor: "text-emerald-700",
      bgClass: "bg-emerald-500/10 border-emerald-500/20",
      details
    };
  }

  if (run.status === 'failed') {
    return {
      StatusIcon: <XCircle className="h-4 w-4 text-destructive" />,
      statusText: "Falha",
      statusColor: "text-destructive",
      bgClass: "bg-destructive/10 border-destructive/20",
      details: run.error_detail || "Erro desconhecido"
    };
  }

  if (run.status === 'skipped') {
    return {
      StatusIcon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      statusText: "Pulado",
      statusColor: "text-amber-700",
      bgClass: "bg-amber-500/10 border-amber-500/20",
      details: run.skip_reason === 'empty_table' ? "Tabela vazia" : run.skip_reason || ""
    };
  }

  if (run.status === 'running') {
    return {
      StatusIcon: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
      statusText: "Processando",
      statusColor: "text-blue-700",
      bgClass: "bg-blue-500/10 border-blue-500/20",
      details: ""
    };
  }

  return {
    StatusIcon: <HelpCircle className="h-4 w-4 text-muted-foreground" />,
    statusText: "Desconhecido",
    statusColor: "text-muted-foreground",
    bgClass: "bg-secondary/5",
    details: ""
  };
}
