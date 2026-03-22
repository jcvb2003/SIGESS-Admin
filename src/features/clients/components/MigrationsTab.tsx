import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, Database, Users, Shield, FileText } from "lucide-react";

const MIGRATION_STEPS = [
  {
    id: "profiles",
    icon: Users,
    title: "Tabela de Perfis",
    description: "Cria tabela profiles com campos básicos (nome, avatar, telefone) vinculada ao auth.users",
    status: "pending" as const,
  },
  {
    id: "roles",
    icon: Shield,
    title: "Sistema de Roles",
    description: "Cria tabela user_roles com enum (admin, user) e função has_role()",
    status: "pending" as const,
  },
  {
    id: "rls",
    icon: Database,
    title: "Políticas RLS",
    description: "Aplica Row Level Security em todas as tabelas com políticas por role",
    status: "pending" as const,
  },
  {
    id: "storage",
    icon: FileText,
    title: "Buckets de Storage",
    description: "Cria buckets padrão (documentos, fotos) com políticas de acesso",
    status: "pending" as const,
  },
];

export function MigrationsTab() {
  return (
    <div className="space-y-4">
      <Card className="p-6 border-dashed border-2 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-3 mb-3">
          <Rocket className="h-6 w-6 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Configuração Inicial do Projeto</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Execute as migrações abaixo para configurar um projeto Supabase vazio com a estrutura padrão.
          Esta funcionalidade será implementada em breve.
        </p>
        <Badge variant="secondary">Em breve</Badge>
      </Card>

      <div className="grid gap-3">
        {MIGRATION_STEPS.map((step) => (
          <Card key={step.id} className="p-4 opacity-60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-secondary p-2">
                  <step.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled>
                Executar
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
