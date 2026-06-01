import { CheckCircle2, XCircle, HelpCircle, Layers, MoreVertical, ExternalLink, Pencil } from "lucide-react";
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
  tenantCount?: number;
  accountLabel?: string;
  onEdit: (project: Project) => void;
  onClick: (project: Project) => void;
}

function KeyStatusIcon({ status }: { status: Project["key_status"] }) {
  if (status === "valid") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "broken") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
}

function TopologyBadge({ topology }: { topology: Project["topology"] }) {
  const colors: Record<Project["topology"], string> = {
    unconfigured:        "bg-muted text-muted-foreground",
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

export function ProjectCard({ project, tenantCount, accountLabel, onEdit, onClick }: ProjectCardProps) {
  return (
    <Card
      className="group cursor-pointer p-5 transition-all duration-200 hover:border-primary/40 hover:bg-card/80"
      onClick={() => onClick(project)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            <span className="text-sm font-bold text-primary">
              {project.project_name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {project.project_name}
            </p>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {project.tenant_code}
              </code>
              <TopologyBadge topology={project.topology} />
            </div>
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

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <KeyStatusIcon status={project.key_status} />
            {project.key_status === "valid" ? "Chave válida" :
             project.key_status === "broken" ? "Chave inválida" : "Status desconhecido"}
          </span>
          {tenantCount !== undefined && (
            <span className="text-[11px] text-muted-foreground">
              · {tenantCount} {tenantCount === 1 ? "cliente" : "clientes"}
            </span>
          )}
        </div>
        {accountLabel && (
          <span className="shrink-0 text-[11px] text-muted-foreground truncate max-w-[140px]">
            {accountLabel}
          </span>
        )}
      </div>
    </Card>
  );
}
