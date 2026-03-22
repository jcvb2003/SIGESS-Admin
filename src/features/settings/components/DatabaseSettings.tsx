import { Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function DatabaseSettings() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Banco de Dados</h2>
          <p className="text-sm text-muted-foreground">
            Configurações do Supabase principal
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg bg-secondary/50 p-4">
          <p className="text-sm text-muted-foreground">
            O banco de dados está configurado e funcionando corretamente.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium text-foreground">Conectado</span>
          </div>
        </div>
        <Button variant="outline" onClick={() => {}}>Testar Conexão</Button>
      </div>
    </Card>
  );
}
