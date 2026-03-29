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
import { Copy, Check, KeyRound, Trash2, Pencil, Monitor, Save, X, Calendar, History, Cpu, User } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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
import { UsageIndicator } from "./UsageIndicator";
import { cn } from "@/lib/utils";

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
    customer_name: "",
    max_devices: 2, 
    expires_at: "",
    max_manual: 0,
    max_turbo: 0,
    max_agro: 0
  });
  const [editingDeviceHash, setEditingDeviceHash] = useState<string | null>(null);
  const [deviceNewName, setDeviceNewName] = useState("");
  
  const updateMutation = useUpdateLicense();
  const deleteMutation = useDeleteLicense();

  const openEdit = (lic: License) => {
    setEditingLicense(lic);
    setEditForm({
      customer_name: lic.customer_name || "",
      max_devices: lic.max_devices || 2,
      expires_at: lic.expires_at ? new Date(lic.expires_at).toISOString().split('T')[0] : "",
      max_manual: lic.max_manual || 0,
      max_turbo: lic.max_turbo || 0,
      max_agro: lic.max_agro || 0
    });
  };

  const handleSaveEdit = async () => {
    if (!editingLicense) return;
    try {
      await updateMutation.mutateAsync({
        key: editingLicense.key,
        updates: {
          customer_name: editForm.customer_name.trim() || null,
          max_devices: Number(editForm.max_devices),
          expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
          max_manual: editingLicense.plan === "trial" ? Number(editForm.max_manual) : null,
          max_turbo: editingLicense.plan === "trial" ? Number(editForm.max_turbo) : null,
          max_agro: editingLicense.plan === "trial" ? Number(editForm.max_agro) : null
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
  
  const handleUpdateDeviceName = async (key: string, fp: string, newName: string) => {
    try {
      const lic = licenses.find(l => l.key === key);
      if (!lic) return;
      
      const newMetadata = { ...lic.device_metadata, [fp]: newName };
      await updateMutation.mutateAsync({ key, updates: { device_metadata: newMetadata } });
      
      toast.success("Nome do dispositivo atualizado");
      setEditingDeviceHash(null);
      
      // Update local state if needed (react-query should handle refresh but optimistic update in unlinkingLicense helps)
      setUnlinkingLicense(prev => {
        if (!prev) return null;
        return { ...prev, device_metadata: newMetadata };
      });
    } catch (err) {
      console.error("Error updating device name:", err);
      toast.error("Erro ao atualizar nome");
    }
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
            max_manual: null,
            max_turbo: null,
            max_agro: null
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
            <TableHead className="w-[180px]">
              <div className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                <span>Chave</span>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>Cliente</span>
              </div>
            </TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" />
                <span>Disp.</span>
              </div>
            </TableHead>
            <TableHead className="min-w-[150px]">
              <div className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                <span>Consumo</span>
              </div>
            </TableHead>
            <TableHead>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                <span>Criada em</span>
              </div>
            </TableHead>
            <TableHead>Validade</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licenses.map((lic) => {
            const plan = planConfig[lic.plan] || planConfig.trial;
            const status = statusConfig[lic.status] || statusConfig.active;
            const expiry = lic.expires_at
              ? format(new Date(lic.expires_at), "dd/MM/yyyy", { locale: ptBR })
              : "—";

            return (
              <TableRow key={lic.key} className="group hover:bg-muted/50 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs font-semibold">{lic.key}</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleCopy(lic.key)}>
                      {copiedKey === lic.key ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn("text-xs font-medium", !lic.customer_name && "text-muted-foreground/50 italic")}>
                    {lic.customer_name || "Não informado"}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-tight px-1.5 h-5", plan.className)}>
                    {plan.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs font-medium", (lic.fingerprints?.length || 0) >= lic.max_devices ? "text-amber-600" : "")}>
                      {lic.fingerprints?.length || 0} / {lic.max_devices}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <UsageIndicator license={lic} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">
                      {lic.created_at ? format(new Date(lic.created_at), "dd/MM/yy") : "—"}
                    </span>
                    {lic.created_at && (
                      <span className="text-[10px] text-muted-foreground/60">
                        há {formatDistanceToNow(new Date(lic.created_at), { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-medium text-muted-foreground">{expiry}</TableCell>
                <TableCell>
                  <Badge variant={status.variant} className="text-[10px] h-5">{status.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => openEdit(lic)} title="Editar Limites">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {(lic.fingerprints?.length || 0) > 0 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted" onClick={() => setUnlinkingLicense(lic)} title="Gerenciar Dispositivos">
                        <Monitor className="h-4 w-4" />
                      </Button>
                    )}
                    {lic.plan === "paid" && lic.status === "active" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10" onClick={() => handleAction("renew", lic.key)} title="Renovar +1 Ano">
                        <Calendar className="h-4 w-4" />
                      </Button>
                    )}
                    {lic.status === "expired" && lic.plan === "trial" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500 hover:bg-amber-500/10" onClick={() => handleAction("convert", lic.key)} title="Converter para Pago">
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                    {lic.status === "blocked" ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10" onClick={() => handleAction("unblock", lic.key)} title="Desbloquear">
                        <Check className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleAction("block", lic.key)} title="Bloquear Licença">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleAction("delete", lic.key)} title="Excluir Permanentemente">
                      <Trash2 className="h-4 w-4" />
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
              {unlinkingLicense?.fingerprints?.map((fp) => {
                const deviceName = unlinkingLicense?.device_metadata?.[fp] || "Sem nome";
                const isEditing = editingDeviceHash === fp;
                
                return (
                  <div key={fp} className="flex flex-col p-2 rounded-md bg-secondary/30 border border-border group gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        {isEditing ? (
                          <Input 
                            value={deviceNewName} 
                            onChange={(e) => setDeviceNewName(e.target.value)}
                            className="h-7 text-xs py-0"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleUpdateDeviceName(unlinkingLicense.key, fp, deviceNewName)}
                          />
                        ) : (
                          <span className="text-xs font-semibold truncate" title={deviceName}>{deviceName}</span>
                        )}
                      </div>
                      
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10"
                              onClick={() => handleUpdateDeviceName(unlinkingLicense.key, fp, deviceNewName)}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 text-muted-foreground hover:bg-muted/10"
                              onClick={() => setEditingDeviceHash(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setEditingDeviceHash(fp);
                              setDeviceNewName(deviceName === "Sem nome" ? "" : deviceName);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleUnlinkDevice(fp)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <span className="font-mono text-[9px] text-muted-foreground/60 truncate" title={fp}>{fp}</span>
                  </div>
                );
              })}
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
              <Label htmlFor="customer_name" className="text-right text-xs">
                Cliente
              </Label>
              <Input
                id="customer_name"
                className="col-span-3 text-xs"
                placeholder="Ex: João Silva"
                value={editForm.customer_name}
                onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="max_devices" className="text-right text-xs">
                Dispositivos
              </Label>
              <Input
                id="max_devices"
                type="number"
                min="1"
                className="col-span-3 text-xs"
                value={editForm.max_devices}
                onChange={(e) => setEditForm(prev => ({ ...prev, max_devices: Number(e.target.value) }))}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expires_at" className="text-right text-xs">
                Validade
              </Label>
              <Input
                id="expires_at"
                type="date"
                className="col-span-3 text-xs"
                value={editForm.expires_at}
                onChange={(e) => setEditForm(prev => ({ ...prev, expires_at: e.target.value }))}
              />
            </div>

            {editingLicense?.plan === "trial" && (
              <div className="pt-2 border-t mt-4">
                <h4 className="text-sm font-semibold mb-3">Limites de Uso</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="max_manual" className="text-right text-xs">
                      Manual
                    </Label>
                    <Input
                      id="max_manual"
                      type="number"
                      min="0"
                      className="col-span-3"
                      value={editForm.max_manual}
                      onChange={(e) => setEditForm(prev => ({ ...prev, max_manual: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="max_turbo" className="text-right text-xs">
                      Turbo
                    </Label>
                    <Input
                      id="max_turbo"
                      type="number"
                      min="0"
                      className="col-span-3"
                      value={editForm.max_turbo}
                      onChange={(e) => setEditForm(prev => ({ ...prev, max_turbo: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="max_agro" className="text-right text-xs">
                      Agro
                    </Label>
                    <Input
                      id="max_agro"
                      type="number"
                      min="0"
                      className="col-span-3"
                      value={editForm.max_agro}
                      onChange={(e) => setEditForm(prev => ({ ...prev, max_agro: Number(e.target.value) }))}
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
