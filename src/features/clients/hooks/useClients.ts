import { useQuery } from "@tanstack/react-query";
import { listClients } from "@/services/clients.service";

export const clientsQueryKey = ["clients"] as const;

export function useClients() {
  return useQuery({
    queryKey: clientsQueryKey,
    queryFn: listClients,
  });
}
