import { CheckCircle2, XCircle, HelpCircle, Layers, Users, MoreVertical, ExternalLink, Pencil, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project } from "../types";
import { TOPOLOGY_LABEL } from "../types";

interface ProjectCardProps {
  project: Project;
  clientCount: number;
  accountLabel?: string;
  onEdit: (project: Project) => void;
  onClick: (project: Project) => void;
}

function HealthBadge({ status }: { status: Project["key_status"] }) {
  if (status === "valid")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Credenciais OK
      </span>
    );
  if (status === "broken")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
        <XCircle className="h-3 w-3" />
        Chave inválida
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <HelpCircle className="h-3 w-3" />
      Não verificado
    </span>
  );
}

function TopologyBadge({ topology }: { topology: Project["topology"] }) {
  const colors: Record<Project["topology"], string> = {
    unconfigured:        "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    isolated_single:     "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    isolated_polo:       "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    shared_multi_single: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    shared_multi_polo:   "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    shared_hybrid:       "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[topology]}`}>
      <Layers className="h-2.5 w-2.5" />
      {TOPOLOGY_LABEL[topology]}
    </span>
  );
}

export function ProjectCard({ project, clientCount, accountLabel, onEdit, onClick }: ProjectCardProps) {
  const isUnconfigured = project.topology === "unconfigured";

  return (
    <Card
      className="group cursor-pointer p-5 transition-all duration-200 hover:border-primary/40 hover:bg-card/80"
      onClick={() => onClick(project)}
    >
      {/* Header — nome + menu */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isUnconfigured ? "bg-amber-500/15" : "bg-primary/20"}`}>
            {isUnconfigured
              ? <AlertTriangle className="h-5 w-5 text-amber-500" />
              : <span className="text-sm font-bold text-primary">{project.project_name.charAt(0).toUpperCase()}</span>
            }
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {project.project_name}
            </p>
            {accountLabel && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {accountLabel}
              </p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(project); }}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar Projeto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(project.supabase_url, "_blank"); }}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir Supabase
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Middle — arquitetura + health */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TopologyBadge topology={project.topology} />
        <HealthBadge status={project.key_status} />
      </div>

      {/* Footer — contagem de clientes */}
      <div className="mt-3 flex items-center gap-1.5 border-t border-border/40 pt-3">
        <Users className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[12px] font-medium text-foreground">
          {clientCount === 0
            ? "Nenhum tenant"
            : clientCount === 1
            ? "1 tenant"
            : `${clientCount} tenants`}
        </span>
      </div>
    </Card>
  );
}
