import { useQuery } from "@tanstack/react-query";
import { listClientes } from "@/services/commercial-tenants.service";

export const clientsQueryKey = ["clients"] as const;

export function useClients() {
  return useQuery({
    queryKey: clientsQueryKey,
    queryFn: listClientes,
  });
}
