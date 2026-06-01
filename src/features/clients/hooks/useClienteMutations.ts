import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCliente, updateCliente, deleteCliente } from "@/services/commercial-tenants.service";
import type { ClienteCreate, ClienteUpdate } from "@/features/clients/types";
import { clientesQueryKey } from "./useClientes";
import { projectDetailQueryKey } from "./useProjectDetail";

export function useCreateCliente(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ClienteCreate) => createCliente(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientesQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(projectId) });
    },
  });
}

export function useUpdateCliente(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClienteUpdate }) =>
      updateCliente(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientesQueryKey(projectId) });
    },
  });
}

export function useDeleteCliente(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCliente(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientesQueryKey(projectId) });
      queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(projectId) });
    },
  });
}
