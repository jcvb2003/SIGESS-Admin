import { Badge } from "@/components/ui/badge";
import type { Client } from "@/features/clients";

interface HealthBadgeProps {
  readonly client: Client;
}

export function HealthBadge({ client }: HealthBadgeProps) {
  if (client.key_status === "valid") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        Saudável
      </Badge>
    );
  }

  if (client.key_status === "broken") {
    return <Badge variant="destructive">Conexão quebrada</Badge>;
  }

  return <Badge variant="secondary">Status desconhecido</Badge>;
}
