import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Layers, Loader2, Search, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Project } from "../types";
import { useProjects } from "../hooks/useProjects";
import { ProjectCard } from "../components/ProjectCard";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { EditProjectModal } from "../components/EditProjectModal";
import { useSupabaseAccounts } from "../../settings/hooks/useSystemSettings";

function StatStrip({ projects }: { projects: Project[] }) {
  const total    = projects.length;
  const valid    = projects.filter((p) => p.key_status === "valid").length;
  const broken   = projects.filter((p) => p.key_status === "broken").length;
  const unknown  = projects.filter((p) => p.key_status === "unknown").length;

  const items = [
    { label: "Total",             value: total,   icon: Layers,        color: "text-primary",          bg: "bg-primary/10" },
    { label: "Chave válida",      value: valid,   icon: CheckCircle2,  color: "text-emerald-500",       bg: "bg-emerald-500/10" },
    { label: "Chave inválida",    value: broken,  icon: XCircle,       color: broken > 0 ? "text-destructive" : "text-muted-foreground", bg: broken > 0 ? "bg-destructive/10" : "bg-muted/40" },
    { label: "Status desconhecido", value: unknown, icon: HelpCircle,  color: "text-muted-foreground",  bg: "bg-muted/40" },
  ];

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border/40 rounded-xl border border-border/50 sm:grid-cols-4 sm:divide-y-0">
      {items.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="flex items-center gap-3 px-5 py-4">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectsPage() {
  const navigate   = useNavigate();
  const [addOpen, setAddOpen]     = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [search, setSearch]       = useState("");

  const { data: projects = [], isLoading } = useProjects();
  const { data: accounts = [] }            = useSupabaseAccounts();

  const accountMap = useMemo(() =>
    Object.fromEntries(accounts.map((a) => [a.id, a.label ?? a.id])),
    [accounts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.project_name.toLowerCase().includes(q) ||
        p.tenant_code.toLowerCase().includes(q),
    );
  }, [projects, search]);

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
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Projetos</h1>
            <p className="mt-1 text-muted-foreground">
              Projetos Supabase provisionados — cada projeto contém um ou mais clientes.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Projeto
          </Button>
        </div>

        <StatStrip projects={projects} />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {filtered.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                accountLabel={accountMap[project.supabase_account_id ?? ""] ?? undefined}
                onEdit={(p) => setEditProject(p)}
                onClick={(p) => navigate(`/clients/${p.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">
              {search ? "Nenhum projeto encontrado" : "Nenhum projeto cadastrado"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {search ? "Tente ajustar sua busca" : "Adicione seu primeiro projeto para começar"}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Projeto
              </Button>
            )}
          </div>
        )}

        <AddProjectDialog open={addOpen} onOpenChange={setAddOpen} />

        {editProject && (
          <EditProjectModal
            project={editProject}
            open={!!editProject}
            onOpenChange={(v) => { if (!v) setEditProject(null); }}
            onUpdated={() => setEditProject(null)}
          />
        )}
      </div>
    </MainLayout>
  );
}
