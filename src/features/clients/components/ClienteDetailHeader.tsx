import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Cliente } from "../types";

interface ClienteDetailHeaderProps {
  cliente: Cliente;
  projectName: string;
  onBack: () => void;
  onEdit: () => void;
}

export function ClienteDetailHeader({
  cliente,
  projectName,
  onBack,
  onEdit,
}: Readonly<ClienteDetailHeaderProps>) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {cliente.logo_url ? (
          <img
            src={cliente.logo_url}
            alt={cliente.nome_entidade}
            className="h-11 w-11 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20">
            <span className="text-base font-bold text-primary">
              {cliente.nome_entidade.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{cliente.nome_entidade}</h1>
          <p className="text-xs text-muted-foreground">{projectName}</p>
        </div>
      </div>
      <Button onClick={onEdit}>
        <Pencil className="mr-2 h-4 w-4" />
        Editar Tenant
      </Button>
    </div>
  );
}
