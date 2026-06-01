import { useQuery } from "@tanstack/react-query";
import { listClientesByProject } from "@/services/commercial-tenants.service";

export const clientesQueryKey = (projectId: string) => ["clientes", projectId] as const;

export function useClientes(projectId: string) {
  return useQuery({
    queryKey: clientesQueryKey(projectId),
    queryFn: () => listClientesByProject(projectId),
    enabled: Boolean(projectId),
  });
}
