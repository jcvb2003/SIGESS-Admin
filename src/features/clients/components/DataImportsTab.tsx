import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface DataImportsTabProps {
  readonly clientId: string;
}

interface ImportRecord {
  id: string;
  tabela: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_registros: number;
  created_at: string;
  erro_detalhe: string | null;
  executado_por?: string;
}

export function DataImportsTab({ clientId }: DataImportsTabProps) {
  const { data: imports, isLoading, error } = useQuery<ImportRecord[]>({
    queryKey: ["data-imports", clientId],
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("data_imports")
        .select("*")
        .eq("tenant_id", clientId)
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      return data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center border-dashed border-2 rounded-lg bg-secondary/10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-3" />
        <span className="text-sm text-muted-foreground">Carregando histórico de importações...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive/30 bg-destructive/5">
        <p className="text-sm text-destructive">Erro ao carregar importações: {(error as Error).message}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 border-dashed border-2 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Governança de Dados</h3>
            <p className="text-sm text-muted-foreground">
              Monitoramento de cargas de dados e sincronizações em massa.
            </p>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col border border-border">
        <div className="flex bg-secondary/30 items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Histórico de Importações ({imports?.length || 0})</span>
        </div>
        
        {!imports?.length ? (
          <div className="p-8 text-center space-y-2 text-sm text-muted-foreground border-t border-dashed">
            <p>Nenhuma importação registrada para este tenant.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="p-2 space-y-1">
              {imports.map((item) => (
                <div key={item.id} className="flex items-start justify-between text-sm p-3 rounded-md transition-colors hover:bg-secondary/40">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {item.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {item.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                      {item.status === 'processing' && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                      {item.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                         <p className="font-medium text-foreground capitalize">
                          {item.tabela}
                        </p>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {item.total_registros} linhas
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                      {item.erro_detalhe && (
                        <div className="mt-2 p-2 bg-red-100/30 rounded text-[10px] text-red-800 border border-red-100 font-mono break-all max-w-md">
                          {item.erro_detalhe}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Badge 
                      variant={item.status === 'completed' ? 'outline' : item.status === 'failed' ? 'destructive' : 'secondary'}
                      className={`text-[10px] font-normal ${item.status === 'completed' ? 'border-green-200 text-green-700 bg-green-50' : ''}`}
                    >
                      {item.status}
                    </Badge>
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
