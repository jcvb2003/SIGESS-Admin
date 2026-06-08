import { useMutation, useQueryClient } from "@tanstack/react-query";
import { syncProjectRuntimeMetadata } from "@/services/runtime-tenants.service";
import { tenantsQueryKey } from "./useClientes";
import { projectDetailQueryKey } from "./useProjectDetail";
import { tenantDetailQueryKey } from "./useClienteDetail";

export function useRuntimeMetadataSync(projectId: string, tenantId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => syncProjectRuntimeMetadata(projectId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tenantsQueryKey(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(projectId) }),
        tenantId ? queryClient.invalidateQueries({ queryKey: tenantDetailQueryKey(tenantId) }) : Promise.resolve(),
      ]);
    },
  });
}
