import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime } from "../utils/format-utils";
import type { Client } from "@/features/clients";
import type { ImportRecord } from "../types";

interface ImportHistoryCardProps {
  readonly allImports: ImportRecord[];
  readonly clients: Client[];
  readonly isLoadingImports: boolean;
}

export function ImportHistoryCard({ allImports, clients, isLoadingImports }: ImportHistoryCardProps) {
  const navigate = useNavigate();

  if (isLoadingImports) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed bg-secondary/10">
        <Loader2 className="mr-3 h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Carregando histórico de importações...</span>
      </div>
    );
  }

  return (
    <Card className="border border-border">
      <div className="border-b bg-secondary/30 px-4 py-3">
        <span className="text-sm font-medium">Eventos recentes ({allImports.length})</span>
      </div>

      {allImports.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma importação registrada até o momento.
        </div>
      ) : (
        <ScrollArea className="h-[520px]">
          <div className="space-y-2 p-3">
            {allImports.map((item) => {
              const client = clients.find((entry) => entry.id === item.tenant_id);

              return (
                <div key={item.id} className="rounded-xl border border-border/60 p-4 transition-colors hover:bg-secondary/20">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{client?.nome_entidade ?? "Tenant removido"}</p>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {item.tabela}
                        </Badge>
                        <Badge
                          variant={item.status === "failed" ? "destructive" : "secondary"}
                          className={item.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" : ""}
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {item.total_registros} registro(s) · {formatDateTime(item.created_at)}
                      </p>
                      {item.erro_detalhe ? (
                        <p className="break-all rounded-md bg-destructive/5 p-2 font-mono text-xs text-destructive/80">
                          {item.erro_detalhe}
                        </p>
                      ) : null}
                    </div>

                    {client ? (
                      <Button variant="ghost" onClick={() => navigate(`/clients/${client.id}`)}>
                        Abrir tenant
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
