import { Badge } from "@/components/ui/badge";
import type { Client } from "@/features/clients";

interface PublicConfigBadgeProps {
  readonly client: Client;
}

export function PublicConfigBadge({ client }: PublicConfigBadgeProps) {
  const ok = !!(client.tenant_code && client.supabase_publishable_key);

  if (ok) {
    return (
      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50">
        Config pública OK
      </Badge>
    );
  }

  const reason = client.tenant_code ? "anon key ausente" : "código ausente";
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
      Config pública: {reason}
    </Badge>
  );
}
