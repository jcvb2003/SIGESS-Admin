import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, KeyRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project, Topology } from "../types";
import { TOPOLOGY_LABEL } from "../types";
import { useUpdateProject } from "../hooks/useProjectMutations";
import { getTopologyOptions } from "../lib/topologyTransitions";

interface EditProjectModalProps {
  readonly project: Project;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated?: (updated: Project) => void;
  readonly tenantCount?: number;
  readonly tenantsWithUnits?: number;
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-secondary/20 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function EditProjectModal({
  project,
  open,
  onOpenChange,
  onUpdated,
  tenantCount = 0,
  tenantsWithUnits = 0,
}: EditProjectModalProps) {
  const topologyOptions = getTopologyOptions(project.topology, tenantCount, tenantsWithUnits);
  const [form, setForm] = useState({
    project_name:             project.project_name,
    topology:                 project.topology as Topology,
    supabase_url:             project.supabase_url,
    supabase_publishable_key: project.supabase_publishable_key,
    supabase_secret_keys:     "",
    supabase_access_token:    "",
  });
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const updateProject = useUpdateProject();

  useEffect(() => {
    if (open) {
      setForm({
        project_name:             project.project_name,
        topology:                 project.topology as Topology,
        supabase_url:             project.supabase_url,
        supabase_publishable_key: project.supabase_publishable_key,
        supabase_secret_keys:     "",
        supabase_access_token:    "",
      });
      setCredentialsOpen(false);
    }
  }, [open, project]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    try {
      const payload: Record<string, unknown> = {
        project_name:             form.project_name,
        topology:                 form.topology,
        supabase_url:             form.supabase_url,
        supabase_publishable_key: form.supabase_publishable_key,
      };
      if (form.supabase_secret_keys)  payload.supabase_secret_keys  = form.supabase_secret_keys;
      if (form.supabase_access_token) payload.supabase_access_token = form.supabase_access_token;

      const result = await updateProject.mutateAsync({ id: project.id, input: payload });
      toast.success("Projeto atualizado com sucesso");
      onUpdated?.(result);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Erro ao salvar: ${error instanceof Error ? error.message : "Erro desconhecido"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar Projeto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1">
          <SectionBox title="Projeto">
            <FieldRow label="Nome do Projeto">
              <Input
                value={form.project_name}
                onChange={(e) => update("project_name", e.target.value)}
                placeholder="Ex: Projeto Pará"
              />
            </FieldRow>

            <FieldRow
              label="Arquitetura"
              hint="Define quais funcionalidades de polo e multi-tenant estarão disponíveis."
            >
              <Select value={form.topology} onValueChange={(v) => update("topology", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {topologyOptions.map(({ topology, disabled, reason }) => (
                    <SelectItem key={topology} value={topology} disabled={disabled}>
                      <div className="flex flex-col gap-0.5">
                        <span className={disabled ? "text-muted-foreground" : undefined}>
                          {TOPOLOGY_LABEL[topology]}
                        </span>
                        {disabled && reason && (
                          <span className="text-[10px] text-muted-foreground/70">{reason}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </SectionBox>

          <SectionBox title="Infraestrutura">
            <FieldRow label="URL do Supabase">
              <Input
                value={form.supabase_url}
                onChange={(e) => update("supabase_url", e.target.value)}
                placeholder="https://xxx.supabase.co"
                className="font-mono text-sm"
              />
            </FieldRow>
            <FieldRow label="Chave Pública (anon)">
              <Input
                value={form.supabase_publishable_key}
                onChange={(e) => update("supabase_publishable_key", e.target.value)}
                className="font-mono text-sm"
              />
            </FieldRow>
          </SectionBox>

          <div className="rounded-lg border border-border/50">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setCredentialsOpen((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Credenciais Sensíveis
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Em branco = mantém valor atual
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${credentialsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {credentialsOpen && (
              <div className="space-y-3 border-t border-border/50 bg-secondary/20 px-4 pb-4 pt-3">
                <FieldRow label="Chave Secreta (service_role)">
                  <Input
                    type="password"
                    value={form.supabase_secret_keys}
                    onChange={(e) => update("supabase_secret_keys", e.target.value)}
                    placeholder="eyJ…"
                  />
                </FieldRow>
                <FieldRow label="Access Token (PAT)">
                  <div className="mb-1.5">
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-500">
                      Acesso Total à Conta
                    </span>
                  </div>
                  <Input
                    type="password"
                    value={form.supabase_access_token}
                    onChange={(e) => update("supabase_access_token", e.target.value)}
                    placeholder="sbp_…"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border/50">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={
              updateProject.isPending ||
              !form.project_name.trim() ||
              !form.supabase_url.trim() ||
              !form.supabase_publishable_key.trim()
            }
          >
            {updateProject.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
