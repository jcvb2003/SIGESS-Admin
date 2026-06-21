import { useState, useEffect } from "react";
import { Database, Save, Loader2, Copy, Check, Terminal, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSystemSettings, useUpdateSystemSetting, useInitialSchemaUpdatedAt } from "../hooks/useSystemSettings";
import { useProjects } from "@/features/clients/hooks/useProjects";
import { toast } from "sonner";

const KEY_PROJECT_REF = "baseline_project_ref";
const KEY_DATABASE_URL = "baseline_database_url";
const COMMAND = "npm run schema:update-initial -- --promote";

export function GovernanceSettings() {
  const { data: settings, isLoading: loadingSettings } = useSystemSettings();
  const { data: projects = [], isLoading: loadingProjects } = useProjects();
  const { data: schemaUpdatedAt } = useInitialSchemaUpdatedAt();
  const updateSetting = useUpdateSystemSetting();

  const savedProjectId = settings?.find((s) => s.key === KEY_PROJECT_REF)?.value ?? "";
  const hasDatabaseUrl = settings?.find((s) => s.key === KEY_DATABASE_URL)?.value === "••••••••";

  const [selectedProjectId, setSelectedProjectId] = useState(savedProjectId);
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (savedProjectId && !selectedProjectId) setSelectedProjectId(savedProjectId);
  }, [savedProjectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleSaveProject = async () => {
    if (!selectedProjectId) { toast.error("Selecione um projeto de referência."); return; }
    try {
      await updateSetting.mutateAsync({ key: KEY_PROJECT_REF, value: selectedProjectId });
      toast.success("Projeto de referência salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  const handleSaveDatabaseUrl = async () => {
    if (!databaseUrl || databaseUrl === "••••••••") {
      toast.info("URL de banco não alterada.");
      return;
    }
    try {
      await updateSetting.mutateAsync({ key: KEY_DATABASE_URL, value: databaseUrl });
      setDatabaseUrl("");
      toast.success("Database URL salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLoading = loadingSettings || loadingProjects;

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-foreground">Governança — Baseline de Schema</h2>
            {schemaUpdatedAt ? (
              <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                Gerado em {new Date(schemaUpdatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-400">
                <AlertTriangle className="h-2.5 w-2.5" />
                Schema não gerado
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Define o projeto de referência para geração do schema canônico.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Projeto de referência */}
        <div className="space-y-2">
          <Label>Projeto de referência</Label>
          <div className="flex gap-2">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar projeto..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.project_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSaveProject}
              disabled={updateSetting.isPending || !selectedProjectId || selectedProjectId === savedProjectId}
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
          {selectedProject && savedProjectId === selectedProjectId && (
            <p className="text-xs text-muted-foreground">
              Referência ativa: <span className="font-medium">{selectedProject.project_name}</span>
            </p>
          )}
        </div>

        {/* Database URL para pg_dump */}
        <div className="space-y-2">
          <Label>Database URL (pg_dump)</Label>
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="new-password"
              value={databaseUrl}
              placeholder={hasDatabaseUrl ? "URL configurada — deixe em branco para manter" : "postgresql://postgres.ref:senha@pooler..."}
              onChange={(e) => setDatabaseUrl(e.target.value)}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSaveDatabaseUrl}
              disabled={updateSetting.isPending || !databaseUrl || databaseUrl === "••••••••"}
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Connection string usada pelo script <code>update-initial-schema.ts</code> para rodar pg_dump.
          </p>
        </div>

        {/* Comando para executar */}
        {savedProjectId && hasDatabaseUrl && (
          <div className="rounded-lg border border-border/50 bg-secondary/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              Executar localmente (na raiz do Admin)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-background px-3 py-2 text-xs font-mono text-foreground border border-border/50 select-all">
                {COMMAND}
              </code>
              <Button size="icon" variant="ghost" onClick={handleCopy} title="Copiar comando">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O script lerá o projeto de referência e a database URL do banco Admin.
              Falha com erro explícito se não configurados.
            </p>
          </div>
        )}

        {(!savedProjectId || !hasDatabaseUrl) && (
          <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded px-3 py-2 border border-amber-200 dark:border-amber-800">
            Configure o projeto de referência e a database URL para habilitar a geração de baseline.
          </p>
        )}
      </div>
    </Card>
  );
}
