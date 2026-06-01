import { useQuery } from "@tanstack/react-query";
import { getCliente } from "@/services/commercial-tenants.service";

export const clienteDetailQueryKey = (id: string) => ["clientes", id] as const;

export function useClienteDetail(id: string) {
  return useQuery({
    queryKey: clienteDetailQueryKey(id),
    queryFn: () => getCliente(id),
    enabled: Boolean(id),
  });
}
