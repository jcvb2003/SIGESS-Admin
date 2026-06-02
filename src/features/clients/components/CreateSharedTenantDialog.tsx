import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSharedTenantForProject } from "@/services/runtime-tenants.service";
import type { Project } from "../types";

interface CreateSharedTenantDialogProps {
  project: Project;
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (tenantId: string) => void;
}

export function CreateSharedTenantDialog({
  clientId,
  project,
  open,
  onOpenChange,
  onCreated,
}: Readonly<CreateSharedTenantDialogProps>) {
  const queryClient = useQueryClient();
  const [name, setName]     = useState("");
  const [code, setCode]     = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;

    setLoading(true);
    try {
      const created = await createSharedTenantForProject(project, clientId, {
        name: name.trim(),
        code,
        acesso_expira_em: null,
        max_socios: 0,
      });
      await queryClient.invalidateQueries({ queryKey: ["shared-tenants-list"] });
      toast.success(`Tenant "${created.name}" criado com sucesso.`);
      onCreated(created.id);
      onOpenChange(false);
      setName("");
      setCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar tenant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            Novo Tenant
          </DialogTitle>
          <DialogDescription>
            Cria um tenant no projeto compartilhado e registra automaticamente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-name">Nome da Entidade</Label>
            <Input
              id="tenant-name"
              placeholder="Ex: Sindicato dos Pescadores de Breves"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenant-code">Código do Tenant</Label>
            <Input
              id="tenant-code"
              placeholder="Ex: sinpesca-breves"
              value={code}
              onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="font-mono"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Apenas letras minúsculas, números e hífen.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim() || !code.trim()}>
              {loading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <PlusCircle className="mr-2 h-4 w-4" />}
              Criar Tenant
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
