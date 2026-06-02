import { useNavigate } from "react-router-dom";
import { Users, HardDrive, Activity, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "../components/StatsCard";
import { MiniCalendar } from "../components/MiniCalendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth";
import { useProjects } from "@/features/clients/hooks/useProjects";
import { TOPOLOGY_LABEL } from "@/features/clients/types";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: projects = [], isLoading } = useProjects();

  const valid   = projects.filter((p) => p.key_status === "valid").length;
  const broken  = projects.filter((p) => p.key_status === "broken").length;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Olá, {user?.email?.split("@")[0] || "Admin"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Visão geral do seu painel administrativo
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total de Projetos"
            value={projects.length}
            subtitle="projetos Supabase"
            icon={Users}
          />
          <StatsCard
            title="Chave Válida"
            value={valid}
            subtitle="credenciais OK"
            icon={Activity}
          />
          <StatsCard
            title="Chave Inválida"
            value={broken}
            subtitle="requer atenção"
            icon={HardDrive}
          />
          <StatsCard
            title="Sem Status"
            value={projects.length - valid - broken}
            subtitle="não verificado"
            icon={Activity}
          />
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Projects */}
          <Card className="col-span-2 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Projetos Recentes
            </h2>
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum projeto cadastrado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 5).map((project) => (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/clients/${project.id}`)}
                    className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                        <span className="text-sm font-bold text-primary">
                          {project.project_name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {project.project_name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {TOPOLOGY_LABEL[project.topology]}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="default"
                      className="bg-primary/20 text-primary border-primary/30"
                    >
                      {TOPOLOGY_LABEL[project.topology]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Calendar + Quick Actions */}
          <div className="space-y-6">
            <MiniCalendar />
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Ações Rápidas
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => navigate("/clients")}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-sm transition-colors hover:bg-secondary"
                >
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-foreground">Gerenciar Projetos</span>
                </button>
                <button
                  onClick={() => navigate("/observability")}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-sm transition-colors hover:bg-secondary"
                >
                  <HardDrive className="h-4 w-4 text-primary" />
                  <span className="text-foreground">Centro de Comando</span>
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
