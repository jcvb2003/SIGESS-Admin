import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, KeyRound, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from "@/components/ui/dialog";
import { License } from "../types";
import { useUpdateLicense, useDeleteLicense } from "../hooks";

interface LicenseTableProps {
  readonly licenses: License[];
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  expired: { label: "Expirado", variant: "destructive" },
  blocked: { label: "Bloqueado", variant: "secondary" },
};

const planConfig: Record<string, { label: string; className: string }> = {
  trial: { label: "Trial", className: "bg-amber-500/15 text-amber-600 border-amber-500/20 hover:bg-amber-500/15" },
  paid: { label: "Pago", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/15" },
};

export function LicenseTable({ licenses }: LicenseTableProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [unlinkingLicense, setUnlinkingLicense] = useState<License | null>(null);
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [editForm, setEditForm] = useState({ 
    max_devices: 2, 
    expires_at: "",
    max_usage_manual: 0,
    max_usage_turbo: 0,
    max_usage_agro: 0
  });
  const updateMutation = useUpdateLicense();
  const deleteMutation = useDeleteLicense();

  const openEdit = (lic: License) => {
    setEditingLicense(lic);
    setEditForm({
      max_devices: lic.max_devices || 2,
      expires_at: lic.expires_at ? new Date(lic.expires_at).toISOString().split('T')[0] : "",
      max_usage_manual: lic.max_usage_manual || 0,
      max_usage_turbo: lic.max_usage_turbo || 0,
      max_usage_agro: lic.max_usage_agro || 0
    });
  };

  const handleSaveEdit = async () => {
    if (!editingLicense) return;
    try {
      await updateMutation.mutateAsync({
        key: editingLicense.key,
        updates: {
          max_devices: Number(editForm.max_devices),
          expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
          max_usage_manual: editingLicense.plan === "trial" ? Number(editForm.max_usage_manual) : null,
          max_usage_turbo: editingLicense.plan === "trial" ? Number(editForm.max_usage_turbo) : null,
          max_usage_agro: editingLicense.plan === "trial" ? Number(editForm.max_usage_agro) : null
        }
      });
      toast.success("Limites da licença atualizados");
      setEditingLicense(null);
    } catch (err) {
      console.error("Error updating license:", err);
      toast.error("Erro ao atualizar licença");
    }
  };

  const handleCopy = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("Chave copiada!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleUnlinkDevice = (fp: string) => {
    if (!unlinkingLicense) return;
    if (confirm("Desvincular este dispositivo?")) {
      handleAction("unlink", unlinkingLicense.key, fp);
      setUnlinkingLicense(prev => {
        if (!prev) return null;
        const newFps = (prev.fingerprints || []).filter(f => f !== fp);
        return { ...prev, fingerprints: newFps };
      });
    }
  };

  const handleAction = async (action: string, key: string, extra?: string) => {
    switch (action) {
      case "block":
        await updateMutation.mutateAsync({ key, updates: { status: "blocked" } });
        toast.success(`Licença ${key} bloqueada`);
        break;
      case "unblock":
        await updateMutation.mutateAsync({ key, updates: { status: "active" } });
        toast.success(`Licença ${key} desbloqueada`);
        break;
      case "unlink": {
        const licToUpdate = licenses.find(l => l.key === key);
        if (!licToUpdate) return;
        const newFps = (licToUpdate.fingerprints || []).filter(fp => fp !== extra);
        await updateMutation.mutateAsync({ key, updates: { fingerprints: newFps } });
        toast.success(`Dispositivo desvinculado`);
        break;
      }
      case "renew": {
        const lic = licenses.find(l => l.key === key);
        const baseDate = lic?.expires_at ? new Date(lic.expires_at) : new Date();
        baseDate.setFullYear(baseDate.getFullYear() + 1);
        await updateMutation.mutateAsync({ key, updates: { expires_at: baseDate.toISOString(), status: "active" } });
        toast.success(`Licença ${key} renovada por +1 ano`);
        break;
      }
      case "convert": {
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        await updateMutation.mutateAsync({ 
          key, 
          updates: { 
            plan: "paid", 
            status: "active", 
            expires_at: expiryDate.toISOString(),
            max_usage_manual: null,
            max_usage_turbo: null,
            max_usage_agro: null
          } 
        });
        toast.success(`Licença ${key} convertida para plano pago`);
        break;
      }
      case "delete":
        if (confirm(`Excluir licença ${key}?`)) {
          await deleteMutation.mutateAsync(key);
        }
        break;
    }
  };

  if (licenses.length === 0) {
    return (
      <div className="text-center py-12">
        <KeyRound className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Nenhuma licença cadastrada</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Chave</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Dispositivos</TableHead>
            <TableHead>Validade</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licenses.map((lic) => {
            const plan = planConfig[lic.plan] || planConfig.trial;
            const status = statusConfig[lic.status] || statusConfig.active;
            const usage = `${(lic.fingerprints?.length || 0)} / ${lic.max_devices || 2}`;
            const expiry = lic.expires_at
              ? format(new Date(lic.expires_at), "dd/MM/yyyy", { locale: ptBR })
              : "—";

            return (
              <TableRow key={lic.key}>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs">{lic.key}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleCopy(lic.key)}>
                      {copiedKey === lic.key ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={plan.className}>{plan.label}</Badge>
                </TableCell>
                <TableCell className="font-medium">{usage}</TableCell>
                <TableCell className="text-muted-foreground">{expiry}</TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {(lic.fingerprints?.length || 0) > 0 && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUnlinkingLicense(lic)}>
                        Gerenciar Disp.
                      </Button>
                    )}
                    {lic.plan === "paid" && lic.status === "active" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAction("renew", lic.key)}>
                        Renovar
                      </Button>
                    )}
                    {lic.status === "expired" && lic.plan === "trial" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAction("convert", lic.key)}>
                        Converter
                      </Button>
                    )}
                    {lic.status === "blocked" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAction("unblock", lic.key)}>
                        Desbloquear
                      </Button>
                    )}
                    {lic.status !== "blocked" && lic.status !== "expired" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleAction("block", lic.key)}>
                        Bloquear
                      </Button>
                    )}
                    <Button variant="outline" size="icon" className="h-7 w-7 text-primary border-primary/30 hover:bg-primary/10" onClick={() => openEdit(lic)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleAction("delete", lic.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Unlink Manager Dialog */}
      <Dialog open={!!unlinkingLicense} onOpenChange={(open) => !open && setUnlinkingLicense(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Gerenciar Dispositivos</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Licença: <span className="font-mono">{unlinkingLicense?.key}</span></p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Cadastrados ({(unlinkingLicense?.fingerprints?.length || 0)})</span>
              <span className="text-xs text-muted-foreground">Limite: {unlinkingLicense?.max_devices}</span>
            </div>
            <div className="grid gap-2 overflow-y-auto max-h-[300px] pr-1">
              {unlinkingLicense?.fingerprints?.map((fp) => (
                <div key={fp} className="flex items-center justify-between p-2 rounded-md bg-secondary/30 border border-border group">
                  <span className="font-mono text-[10px] truncate max-w-[250px]" title={fp}>{fp}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleUnlinkDevice(fp)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Remova um print para liberar espaço para um novo dispositivo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUnlinkingLicense(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit License Limits Dialog */}
      <Dialog open={!!editingLicense} onOpenChange={(open) => !open && setEditingLicense(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Licença</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">Chave: <span className="font-mono">{editingLicense?.key}</span></p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max_devices" className="text-right">
                Dispositivos
              </Label>
              <Input
                id="max_devices"
                type="number"
                min="1"
                className="col-span-3"
                value={editForm.max_devices}
                onChange={(e) => setEditForm(prev => ({ ...prev, max_devices: Number(e.target.value) }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expires_at" className="text-right">
                Validade
              </Label>
              <Input
                id="expires_at"
                type="date"
                className="col-span-3"
                value={editForm.expires_at}
                onChange={(e) => setEditForm(prev => ({ ...prev, expires_at: e.target.value }))}
              />
            </div>

            {editingLicense?.plan === "trial" && (
              <div className="pt-2 border-t mt-4">
                <h4 className="text-sm font-semibold mb-3">Limites de Uso</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="max_usage_manual" className="text-right text-xs">
                      Manual
                    </Label>
                    <Input
                      id="max_usage_manual"
                      type="number"
                      min="0"
                      className="col-span-3"
                      value={editForm.max_usage_manual}
                      onChange={(e) => setEditForm(prev => ({ ...prev, max_usage_manual: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="max_usage_turbo" className="text-right text-xs">
                      Turbo
                    </Label>
                    <Input
                      id="max_usage_turbo"
                      type="number"
                      min="0"
                      className="col-span-3"
                      value={editForm.max_usage_turbo}
                      onChange={(e) => setEditForm(prev => ({ ...prev, max_usage_turbo: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="max_usage_agro" className="text-right text-xs">
                      Agro
                    </Label>
                    <Input
                      id="max_usage_agro"
                      type="number"
                      min="0"
                      className="col-span-3"
                      value={editForm.max_usage_agro}
                      onChange={(e) => setEditForm(prev => ({ ...prev, max_usage_agro: Number(e.target.value) }))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingLicense(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
