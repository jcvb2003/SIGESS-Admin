import { useQuery } from "@tanstack/react-query";
import { getTenant } from "@/services/commercial-tenants.service";

export const tenantDetailQueryKey = (id: string) => ["tenants", id] as const;

/** @deprecated use tenantDetailQueryKey */
export const clienteDetailQueryKey = tenantDetailQueryKey;

export function useTenantDetail(id: string) {
  return useQuery({
    queryKey: tenantDetailQueryKey(id),
    queryFn: () => getTenant(id),
    enabled: Boolean(id),
  });
}

/** @deprecated use useTenantDetail */
export const useClienteDetail = useTenantDetail;
