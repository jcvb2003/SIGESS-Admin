import { useQuery } from "@tanstack/react-query";
import { getClienteComProjetoByProjectId } from "@/services/commercial-tenants.service";

export const clientDetailQueryKey = (id: string) => ["clients", id] as const;

export function useClientDetail(id: string) {
  return useQuery({
    queryKey: clientDetailQueryKey(id),
    queryFn: () => getClienteComProjetoByProjectId(id),
    enabled: Boolean(id),
  });
}
