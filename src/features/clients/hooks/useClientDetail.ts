import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/services/clients.service";

export const clientDetailQueryKey = (id: string) => ["clients", id] as const;

export function useClientDetail(id: string) {
  return useQuery({
    queryKey: clientDetailQueryKey(id),
    queryFn: () => getClient(id),
    enabled: Boolean(id),
  });
}
