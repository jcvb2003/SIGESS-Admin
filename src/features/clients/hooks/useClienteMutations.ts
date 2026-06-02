import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTenant, updateTenant, deleteTenant } from "@/services/commercial-tenants.service";
import type { TenantUpdate } from "@/features/clients/types";
import { tenantsQueryKey } from "./useClientes";
import { projectDetailQueryKey } from "./useProjectDetail";

function useTenantsInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: tenantsQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(projectId) });
  };
}

export function useCreateTenant(projectId: string) {
  const invalidate = useTenantsInvalidation(projectId);
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof createTenant>[0], "project_id">) =>
      createTenant({ ...input, project_id: projectId }),
    onSuccess: invalidate,
  });
}

export function useUpdateTenant(projectId: string) {
  const invalidate = useTenantsInvalidation(projectId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TenantUpdate }) =>
      updateTenant(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTenant(projectId: string) {
  const invalidate = useTenantsInvalidation(projectId);
  return useMutation({
    mutationFn: (id: string) => deleteTenant(id),
    onSuccess: invalidate,
  });
}

// Aliases de compatibilidade
/** @deprecated use useCreateTenant */
export const useCreateCliente = useCreateTenant;
/** @deprecated use useUpdateTenant */
export const useUpdateCliente = useUpdateTenant;
/** @deprecated use useDeleteTenant */
export const useDeleteCliente = useDeleteTenant;
