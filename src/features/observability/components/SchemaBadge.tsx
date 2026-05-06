import { Badge } from "@/components/ui/badge";
import type { TenantSchemaStatus } from "../model/schema-comparator";

interface SchemaBadgeProps {
  readonly clientId: string;
  readonly schemaStatus: TenantSchemaStatus[];
}

export function SchemaBadge({ clientId, schemaStatus }: SchemaBadgeProps) {
  const s = schemaStatus.find(x => x.tenantId === clientId);
  
  if (!s) return <Badge variant="secondary">Aguardando</Badge>;
  
  if (s.totalDiffs === 0) return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
      Alinhado
    </Badge>
  );

  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
      Drift: {s.totalDiffs}
    </Badge>
  );
}
