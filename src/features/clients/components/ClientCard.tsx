import { MoreVertical, Trash2, ExternalLink, CreditCard, CheckCircle2, XCircle, HelpCircle, CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Client } from "../types";
import { format, differenceInDays, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientCardProps {
  client: Client;
  onDelete: (client: Client) => void;
  onSubscription: (client: Client) => void;
  onClick: (client: Client) => void;
}

function KeyStatusBadge({ status }: { status: Client["key_status"] }) {
  if (status === "valid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        Chave válida
      </span>
    );
  }
  if (status === "broken") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <XCircle className="h-3 w-3" />
        Chave inválida
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <HelpCircle className="h-3 w-3" />
      Status desconhecido
    </span>
  );
}

function ExpiryInfo({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) {
    return <span className="text-xs text-muted-foreground">Sem expiração</span>;
  }

  const date = new Date(expiresAt);
  const daysLeft = differenceInDays(date, new Date());
  const expired = isPast(date);

  if (expired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <CalendarClock className="h-3 w-3" />
        Expirado em {format(date, "dd/MM/yyyy")}
      </span>
    );
  }

  if (daysLeft <= 30) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
        <CalendarClock className="h-3 w-3" />
        Expira em {daysLeft}d ({format(date, "dd/MM")})
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground">
      Expira {format(date, "dd/MM/yyyy", { locale: ptBR })}
    </span>
  );
}

export function ClientCard({ client, onDelete, onSubscription, onClick }: ClientCardProps) {
  const planLabel =
    client.assinatura === "anual" ? "Anual" :
    client.assinatura === "trial" ? "Trial" : "Mensal";

  const planVariant =
    client.assinatura === "trial" ? "secondary" : "outline";

  return (
    <Card
      className="group cursor-pointer p-5 transition-all duration-200 hover:border-primary/40 hover:bg-card/80"
      onClick={() => onClick(client)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {client.logo_url ? (
            <img
              src={client.logo_url}
              alt={client.nome_entidade}
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <span className="text-sm font-bold text-primary">
                {client.nome_entidade.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {client.nome_entidade}
            </p>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              {client.tenant_code && (
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {client.tenant_code}
                </span>
              )}
              <Badge
                variant={client.deployment_mode === "isolated" ? "outline" : "secondary"}
                className="h-4 px-1.5 text-[10px]"
              >
                {client.deployment_mode}
                {client.shared_mode ? ` · ${client.shared_mode}` : ""}
              </Badge>
              <Badge variant={planVariant} className="h-4 px-1.5 text-[10px]">
                {planLabel}
              </Badge>
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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); window.open(client.supabase_url, "_blank"); }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir Supabase
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onSubscription(client); }}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Assinatura
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(client); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/40 pt-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <KeyStatusBadge status={client.key_status} />
          <ExpiryInfo expiresAt={client.acesso_expira_em} />
        </div>
        {client.email && (
          <span className="shrink-0 text-xs text-muted-foreground truncate max-w-[160px]">
            {client.email}
          </span>
        )}
      </div>
    </Card>
  );
}
