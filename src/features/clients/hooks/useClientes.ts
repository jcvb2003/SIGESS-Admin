import { useQuery } from "@tanstack/react-query";
import { listTenantsByProject } from "@/services/commercial-tenants.service";

export const tenantsQueryKey = (projectId: string) => ["tenants", projectId] as const;

/** @deprecated use tenantsQueryKey */
export const clientesQueryKey = tenantsQueryKey;

export function useTenants(projectId: string) {
  return useQuery({
    queryKey: tenantsQueryKey(projectId),
    queryFn: () => listTenantsByProject(projectId),
    enabled: Boolean(projectId),
  });
}

/** @deprecated use useTenants */
export const useClientes = useTenants;
