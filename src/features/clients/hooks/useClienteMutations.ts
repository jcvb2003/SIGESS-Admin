import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCliente, updateCliente, deleteCliente } from "@/services/commercial-tenants.service";
import type { ClienteUpdate } from "@/features/clients/types";
import { clientesQueryKey } from "./useClientes";
import { projectDetailQueryKey } from "./useProjectDetail";

function useClientesInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: clientesQueryKey(projectId) });
    queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(projectId) });
  };
}

// project_id é injetado pelo hook — o caller não passa, evitando divergência silenciosa
export function useCreateCliente(projectId: string) {
  const invalidate = useClientesInvalidation(projectId);
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof createCliente>[0], "project_id">) =>
      createCliente({ ...input, project_id: projectId }),
    onSuccess: invalidate,
  });
}

export function useUpdateCliente(projectId: string) {
  const invalidate = useClientesInvalidation(projectId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClienteUpdate }) =>
      updateCliente(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCliente(projectId: string) {
  const invalidate = useClientesInvalidation(projectId);
  return useMutation({
    mutationFn: (id: string) => deleteCliente(id),
    onSuccess: invalidate,
  });
}
