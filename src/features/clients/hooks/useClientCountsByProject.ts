import { useQuery } from "@tanstack/react-query";
import { listTenantCountsByProject } from "@/services/commercial-tenants.service";

export const tenantCountsByProjectQueryKey = ["tenants-counts-by-project"] as const;

/** @deprecated use tenantCountsByProjectQueryKey */
export const clientCountsByProjectQueryKey = tenantCountsByProjectQueryKey;

export function useTenantCountsByProject() {
  return useQuery({
    queryKey: tenantCountsByProjectQueryKey,
    queryFn: listTenantCountsByProject,
  });
}

/** @deprecated use useTenantCountsByProject */
export const useClientCountsByProject = useTenantCountsByProject;
