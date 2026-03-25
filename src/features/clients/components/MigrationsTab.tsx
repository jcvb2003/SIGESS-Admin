import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { proxyAction } from "@/services/clients.service";

interface MigrationsTabProps {
  readonly clientId: string;
}

export function MigrationsTab({ clientId }: MigrationsTabProps) {
  const [isMigrating, setIsMigrating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleExecute = async () => {
    if (!confirm("Confirmar aplicação do esquema SIGESS? Isso criará tabelas, funções e buckets no projeto do cliente.")) {
      return;
    }

    setIsMigrating(true);
    try {
      await proxyAction(clientId, "execute-migration");
      setIsSuccess(true);
      toast.success("Esquema SIGESS aplicado com sucesso!");
    } catch (error) {
      const err = error as Error;
      toast.error(`Falha na migração: ${err.message}`);
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 border-dashed border-2 border-primary/30 bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="h-6 w-6 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Configuração SIGESS</h3>
              <p className="text-sm text-muted-foreground mr-4">
                Aplica o esquema de banco de dados padrão (tabelas, funções, RLS e buckets) para o sistema SIGESS.
              </p>
            </div>
          </div>
          <Button 
            onClick={handleExecute} 
            disabled={isMigrating || isSuccess}
            className="shrink-0"
          >
            {isMigrating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aplicando...</>
            ) : (
              isSuccess ? (
                <><CheckCircle2 className="mr-2 h-4 w-4" /> Aplicado</>
              ) : (
                "Executar Migração"
              )
            )}
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 opacity-80">
        <div className="flex items-center gap-2 px-1">
          <Badge variant="outline">Conteúdo do Schema</Badge>
          <span className="text-[10px] text-muted-foreground">sigess_schema.sql</span>
        </div>
        <Card className="p-4 bg-secondary/20 border-none">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1">
              <p className="font-bold text-primary">Tabelas (8)</p>
              <p className="text-muted-foreground">User, templates, entidade, localidades, parametros, socios, fotos, requerimentos</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-primary">Storage (2)</p>
              <p className="text-muted-foreground">fotos, documentos</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-primary">Security</p>
              <p className="text-muted-foreground">RLS em todas as tabelas + Políticas Storage</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-primary">Logica</p>
              <p className="text-muted-foreground">Função auto_generate_cod_req_inss e triggers</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
