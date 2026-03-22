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
import { Copy, Check, KeyRound } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { License } from "../types";
import { useUpdateLicense, useDeleteLicense } from "../hooks";

interface LicenseTableProps {
  licenses: License[];
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
  const updateMutation = useUpdateLicense();
  const deleteMutation = useDeleteLicense();

  const handleCopy = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("Chave copiada!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAction = async (action: string, key: string) => {
    switch (action) {
      case "block":
        await updateMutation.mutateAsync({ key, updates: { status: "blocked" } });
        toast.success(`Licença ${key} bloqueada`);
        break;
      case "unblock":
        await updateMutation.mutateAsync({ key, updates: { status: "active" } });
        toast.success(`Licença ${key} desbloqueada`);
        break;
      case "unlink":
        await updateMutation.mutateAsync({ key, updates: { fingerprint: null } });
        toast.success(`Dispositivo desvinculado da licença ${key}`);
        break;
      case "renew":
        const lic = licenses.find(l => l.key === key);
        const baseDate = lic?.expires_at ? new Date(lic.expires_at) : new Date();
        baseDate.setFullYear(baseDate.getFullYear() + 1);
        await updateMutation.mutateAsync({ key, updates: { expires_at: baseDate.toISOString(), status: "active" } });
        toast.success(`Licença ${key} renovada por +1 ano`);
        break;
      case "convert":
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        await updateMutation.mutateAsync({ key, updates: { plan: "paid", status: "active", expires_at: expiryDate.toISOString() } });
        toast.success(`Licença ${key} convertida para plano pago`);
        break;
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Chave</TableHead>
          <TableHead>Plano</TableHead>
          <TableHead>Uso</TableHead>
          <TableHead>Dispositivo</TableHead>
          <TableHead>Validade</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {licenses.map((lic) => {
          const plan = planConfig[lic.plan] || planConfig.trial;
          const status = statusConfig[lic.status] || statusConfig.active;
          const usage = lic.plan === "trial" ? `${lic.usage_count} / ${lic.max_usage || 5}` : "—";
          const device = lic.fingerprint ? lic.fingerprint.substring(0, 10) + "..." : "Não vinculado";
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
              <TableCell className="text-muted-foreground">{usage}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">{device}</TableCell>
              <TableCell className="text-muted-foreground">{expiry}</TableCell>
              <TableCell>
                <Badge variant={status.variant}>{status.label}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
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
                  {lic.fingerprint && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAction("unlink", lic.key)}>
                      Desvincular
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
                  <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleAction("delete", lic.key)}>
                    Excluir
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
