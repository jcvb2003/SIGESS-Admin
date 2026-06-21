import { useState } from "react";
import { Download, Loader2, ChevronRight, ChevronDown, FolderOpen, FileText, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/features/clients/hooks/useProjects";
import { useBackupTenants, useBackupDates, useBackupFiles } from "../hooks/useBackups";
import { extractProjectRef, getBackupDownloadUrl } from "@/services/backups.service";
import { toast } from "sonner";

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function FilesRow({
  projectRef, tenantCode, date,
}: { projectRef: string; tenantCode: string; date: string }) {
  const { data: files = [], isLoading } = useBackupFiles(projectRef, tenantCode, date);
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = async (path: string, name: string) => {
    try {
      setDownloading(path);
      const url = await getBackupDownloadUrl(path);
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar link de download");
    } finally {
      setDownloading(null);
    }
  };

  if (isLoading) return <div className="py-2 pl-6"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="pl-6 space-y-1">
      {files.map((file) => (
        <div key={file.path} className="flex items-center justify-between py-1.5 px-3 rounded-md hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-mono text-foreground truncate">{file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">{formatBytes(file.size)}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => handleDownload(file.path, file.name)}
            disabled={downloading === file.path}
            title="Download"
          >
            {downloading === file.path
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ))}
      {files.length === 0 && (
        <p className="text-xs text-muted-foreground py-1 px-3">Nenhum arquivo encontrado.</p>
      )}
    </div>
  );
}

function DatesAccordion({ projectRef, tenantCode }: { projectRef: string; tenantCode: string }) {
  const { data: dates = [], isLoading } = useBackupDates(projectRef, tenantCode);
  const [openDate, setOpenDate] = useState<string | null>(null);

  if (isLoading) return <div className="pl-4 py-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>;
  if (dates.length === 0) return <p className="pl-4 text-xs text-muted-foreground py-1">Nenhum backup para este tenant.</p>;

  return (
    <div className="pl-4 space-y-1">
      {dates.map((date) => (
        <div key={date}>
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md hover:bg-muted/30 transition-colors"
            onClick={() => setOpenDate(openDate === date ? null : date)}
          >
            {openDate === date
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className="text-xs font-mono text-foreground">{date}</span>
          </button>
          {openDate === date && (
            <FilesRow projectRef={projectRef} tenantCode={tenantCode} date={date} />
          )}
        </div>
      ))}
    </div>
  );
}

function TenantsAccordion({ projectRef }: { projectRef: string }) {
  const { data: tenants = [], isLoading, error } = useBackupTenants(projectRef);
  const [openTenant, setOpenTenant] = useState<string | null>(null);

  if (isLoading) return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-sm text-destructive py-4">
      <AlertCircle className="h-4 w-4" />
      Erro ao carregar backups: {error instanceof Error ? error.message : "Erro desconhecido"}
    </div>
  );

  if (tenants.length === 0) return (
    <div className="text-center py-8 text-sm text-muted-foreground">
      Nenhum backup encontrado para este projeto.
    </div>
  );

  return (
    <div className="space-y-1">
      {tenants.map((tenant) => (
        <div key={tenant} className="rounded-lg border border-border/50 overflow-hidden">
          <button
            type="button"
            className="flex items-center gap-2 w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors"
            onClick={() => setOpenTenant(openTenant === tenant ? null : tenant)}
          >
            {openTenant === tenant
              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
            <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
            <span className="text-sm font-medium text-foreground">{tenant}</span>
            <Badge variant="outline" className="ml-auto text-[10px]">tenant</Badge>
          </button>
          {openTenant === tenant && (
            <div className="border-t border-border/30 pb-2 pt-1 bg-muted/10">
              <DatesAccordion projectRef={projectRef} tenantCode={tenant} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function BackupDashboard() {
  const { data: projects = [], isLoading: loadingProjects } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const projectRef = selectedProject ? extractProjectRef(selectedProject.supabase_url) : null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Projeto</p>
            <p className="text-xs text-muted-foreground">Selecione um projeto para visualizar seus backups.</p>
          </div>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={loadingProjects}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar projeto..." />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projectRef && (
            <p className="text-xs text-muted-foreground">
              Bucket: <code className="font-mono">backups/{projectRef}/</code>
            </p>
          )}
        </div>
      </Card>

      {projectRef && (
        <Card className="p-5">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Backups de {selectedProject?.project_name}</p>
              <p className="text-xs text-muted-foreground">
                Estrutura: tenant → data → schema.sql / data.sql
              </p>
            </div>
            <TenantsAccordion projectRef={projectRef} />
          </div>
        </Card>
      )}
    </div>
  );
}
