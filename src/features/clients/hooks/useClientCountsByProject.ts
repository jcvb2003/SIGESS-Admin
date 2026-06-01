import { useQuery } from "@tanstack/react-query";
import { listClientesCountsByProject } from "@/services/commercial-tenants.service";

export const clientCountsByProjectQueryKey = ["clientes-counts-by-project"] as const;

export function useClientCountsByProject() {
  return useQuery({
    queryKey: clientCountsByProjectQueryKey,
    queryFn: listClientesCountsByProject,
  });
}
