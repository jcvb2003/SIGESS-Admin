import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, Database, Info, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { proxyAction } from "@/services/clients.service";

interface TableInfo {
  name: string;
  schema: string;
}

interface TablesTabProps {
  readonly clientId: string;
  readonly connectionError: string | null;
  readonly onTablesLoaded?: (count: number) => void;
}

export function TablesTab(props: TablesTabProps) {
  return (
    <ErrorBoundary>
      <TablesTabContent {...props} />
    </ErrorBoundary>
  );
}

function TablesTabContent({ clientId, connectionError, onTablesLoaded }: TablesTabProps) {
  const { 
    data: tables = [], 
    isLoading: loading,
    error: queryError
  } = useQuery<TableInfo[]>({
    queryKey: ["client-tables", clientId],
    queryFn: async () => {
      const data = await proxyAction(clientId, "list-tables");
      
      let rawList: Array<{ name?: string; table_name?: string; schema?: string } | string> = [];
      if (Array.isArray(data)) {
        rawList = data;
      } else if (data && typeof data === 'object' && 'definitions' in data) {
        rawList = Object.keys(data.definitions).map(name => ({ name, schema: "public" }));
      }
      
      return rawList.map((t) => ({
        name: typeof t === 'string' ? t : (t.name || t.table_name || ""),
        schema: (typeof t === 'object' && t.schema) || "public"
      })).filter((t: TableInfo) => t.name);
    },
    enabled: !connectionError && !!clientId,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  useEffect(() => {
    if (tables) {
      onTablesLoaded?.(tables.length);
    }
  }, [tables, onTablesLoaded]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Consultando esquema do banco via Proxy...</p>
      </div>
    );
  }

  if (queryError || connectionError) {
    return (
      <Card className="p-8 border-destructive/20 bg-destructive/5 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-destructive">Falha na Conexão Proxy</h3>
        <p className="text-muted-foreground mt-2">
          {((queryError as Error)?.message) || connectionError || "Erro desconhecido"}
        </p>
      </Card>
    );
  }

  if (tables.length === 0) {
    return (
      <EmptyState
        icon={<Database className="h-8 w-8" />}
        title="Nenhuma tabela visível"
        description="Não foi possível mapear as tabelas do projeto. Verifique se o API PostgREST está ativo e se há tabelas públicas."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tables.map((table) => (
        <Card key={`${table.schema}.${table.name}`} className="p-4 hover:border-primary/50 transition-colors group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 group-hover:bg-primary/20 transition-colors">
                <Table className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{table.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase">{table.schema}</p>
              </div>
            </div>
            <Badge variant="outline" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Info className="h-3 w-3 mr-1" />
              Detalhes
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}
