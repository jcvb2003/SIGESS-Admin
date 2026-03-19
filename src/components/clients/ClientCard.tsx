import { MoreVertical, Trash2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Client } from "@/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClientCardProps {
  client: Client;
  onDelete: (client: Client) => void;
  onClick: (client: Client) => void;
}

export function ClientCard({ client, onDelete, onClick }: ClientCardProps) {
  const subscriptionLabel = client.assinatura === "anual" ? "Anual" : "Mensal";

  return (
    <Card 
      className="p-5 hover:border-primary/30 transition-all duration-300 cursor-pointer group"
      onClick={() => onClick(client)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {client.logo_url ? (
            <img 
              src={client.logo_url} 
              alt={client.nome_entidade} 
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <span className="text-sm font-bold text-primary">
                {client.nome_entidade.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {client.nome_entidade}
              </h3>
              <Badge 
                variant="default"
                className="text-xs bg-primary/20 text-primary border-primary/30"
              >
                {subscriptionLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
              {client.supabase_url}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(client.supabase_url, '_blank'); }}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir Supabase
            </DropdownMenuItem>
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

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>{client.email || "Sem email"}</span>
        <span>{client.telefone}</span>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Cadastrado em {format(new Date(client.data_cadastro), "dd/MM/yyyy", { locale: ptBR })}
      </div>
    </Card>
  );
}
