import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Rocket, Loader2, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { proxyAction } from "@/services/clients.service";

interface MigrationsTabProps {
  readonly clientId: string;
  readonly tables: Array<{ name: string; schema: string }>;
}

interface MigrationRecord {
  name: string;
  status: 'success' | 'failed' | 'pending';
  appliedAt: string | null;
  error: string | null;
}

interface MigrationsStatusResponse {
  success: boolean;
  total: number;
  applied: number;
  failed: number;
  pending: number;
  hasPending: boolean;
  migrations: MigrationRecord[];
}

export function MigrationsTab({ clientId, tables }: MigrationsTabProps) {
  const queryClient = useQueryClient();
  const [isMigrating, setIsMigrating] = useState(false);

  const { data: statusRes, isLoading, error: queryError } = useQuery<MigrationsStatusResponse>({
    queryKey: ["migrations-status", clientId],
    queryFn: () => proxyAction(clientId, "get-migrations-status"),
    retry: 1
  });

  const handleExecute = async () => {
    if (!statusRes?.hasPending) return;

    if (!confirm(`Você está prestes a aplicar ${statusRes.pending} atualizações de schema no banco deste tenant.\nIsso pode afetar dados existentes.\nDeseja continuar?`)) {
      return;
    }

    setIsMigrating(true);
    try {
      await proxyAction(clientId, "execute-migration");
      toast.success("Esquemas sincronizados com sucesso!");
    } catch (error) {
      const err = error as Error;
      toast.error(`Falha na migração: ${err.message}`);
    } finally {
      setIsMigrating(false);
      // Invalidate both the tables list (so main UI updates) and the migration status 
      queryClient.invalidateQueries({ queryKey: ["client-tables", clientId] });
      queryClient.invalidateQueries({ queryKey: ["migrations-status", clientId] });
    }
  };

  const renderButtonContent = (isNewTenant: boolean, hasPending: boolean, pending: number) => {
    if (isMigrating) {
      return <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aplicando...</>;
    }
    if (!hasPending) {
      return <><CheckCircle2 className="mr-2 h-4 w-4" /> Esquema Atualizado</>;
    }
    if (isNewTenant) {
      return "Inicializar Esquema Completo";
    }
    return `Aplicar ${pending} Atualizações`;
  };

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center border-dashed border-2 rounded-lg bg-secondary/10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-3" />
        <span className="text-sm text-muted-foreground">Analisando histórico de schemas...</span>
      </div>
    );
  }

  if (queryError || (!statusRes && !isLoading)) {
    return (
      <Card className="p-6 border-destructive/30 bg-destructive/5 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-destructive">Falha ao carregar status</h4>
          <p className="text-sm text-destructive/80 mt-1">{queryError?.message || 'Erro desconhecido'}</p>
        </div>
      </Card>
    );
  }

  const { migrations, pending, failed, applied, total, hasPending } = statusRes!;
  const isNewTenant = applied === 0 && failed === 0;

  return (
    <div className="space-y-4">
      <Card className="p-6 border-dashed border-2 border-primary/30 bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="h-6 w-6 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground flex items-center">
                Configuração SIGESS 
                {isNewTenant && <Badge variant="secondary" className="ml-2 font-normal text-[10px]">Primeiro Setup</Badge>}
              </h3>
              <p className="text-sm text-muted-foreground mr-4">
                Sincronização de módulos e versões de schema.
              </p>
            </div>
          </div>
          <Button 
            onClick={handleExecute} 
            disabled={isMigrating || !hasPending}
            className="shrink-0"
          >
            {renderButtonContent(isNewTenant, hasPending, pending)}
          </Button>
        </div>
      </Card>

      {/* Falhas / Erros de Execução */}
      {failed > 0 && (
        <div className="space-y-2">
          {migrations
            .filter(m => m.status === 'failed')
            .map(m => (
              <div key={`err-${m.name}`} className="text-sm p-3 bg-red-50 text-red-800 border border-red-200 rounded-md">
                <div className="font-semibold flex items-center gap-2">
                  <XCircle className="h-4 w-4" /> Falha em {m.name.replace(/^\d+_/, '')}
                </div>
                {m.error && <div className="mt-2 p-2 bg-red-100/50 rounded inline-block font-mono text-xs opacity-90 break-all">{m.error}</div>}
              </div>
            ))}
        </div>
      )}

      {/* Feed / Lista de Migrations */}
      <Card className="flex flex-col border border-border">
        <div className="flex bg-secondary/30 items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Histórico de Módulos ({total})</span>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-[10px] text-green-600 border-green-200 bg-green-50">{applied} ok</Badge>
            {pending > 0 && <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-200 bg-slate-50">{pending} na fila</Badge>}
            {failed > 0 && <Badge variant="destructive" className="text-[10px]">{failed} erro(s)</Badge>}
          </div>
        </div>
        
        {isNewTenant ? (
          <div className="p-8 text-center space-y-2 text-sm text-muted-foreground border-t border-dashed">
            <p>O banco deste tenant ainda não possui nenhum pacote oficial registrado.</p>
            <p>Inicialize o esquema para gerar os {total} módulos padrões.</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="p-2 space-y-1">
              {migrations.map((m) => (
                <div key={m.name} className={`flex items-start justify-between text-sm p-3 rounded-md transition-colors hover:bg-secondary/40 ${m.status === 'pending' ? 'bg-secondary/10' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {m.status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {m.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                      {m.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className={`font-medium ${m.status === 'pending' || m.status === 'failed' ? 'text-foreground' : 'text-muted-foreground'} `}>
                        {m.name.replace(/^\d+_/, '')}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                        {m.name.split('_')[0]} 
                        {m.appliedAt && ` • ${new Date(m.appliedAt).toLocaleString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center justify-end">
                    {m.status === 'success' && <Badge variant="outline" className="text-[10px] border-green-200 text-green-700 bg-green-50 font-normal">Aplicado</Badge>}
                    {m.status === 'pending' && <Badge variant="secondary" className="text-[10px] font-normal">Pendente</Badge>}
                    {m.status === 'failed' && <Badge variant="destructive" className="text-[10px] font-normal">Falhou</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
