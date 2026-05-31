import { BookMarked } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HealthBadge } from "./HealthBadge";
import { formatDateTime } from "../utils/format-utils";
import type { Client } from "@/features/clients";

interface ReferenceCardProps {
  readonly client: Client;
}

export function ReferenceCard({ client }: ReferenceCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="flex items-center justify-between gap-4 border-primary/20 bg-primary/5 px-5 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <BookMarked className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{client.nome_entidade}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {client.tenant_code}
            </span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              Referência de Schema
            </span>
            <HealthBadge client={client} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Último health check: {formatDateTime(client.last_health_check_at)}
            {client.health_error_detail && (
              <span className="ml-2 text-destructive/80">{client.health_error_detail}</span>
            )}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-xs text-muted-foreground"
        onClick={() => navigate(`/clients/${client.id}`)}
      >
        Ver cliente
      </Button>
    </Card>
  );
}
