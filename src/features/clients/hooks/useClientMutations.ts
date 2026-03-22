import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, updateClient, deleteClient } from "@/services/clients.service";
import type { ClientCreate, ClientUpdate } from "@/features/clients/types";
import { clientsQueryKey } from "./useClients";

// Invalidação centralizada — não se repete em cada mutation.
function useClientsInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: clientsQueryKey });
    // Invalida o dashboard pois ele agrega dados de clients.
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCreateClient() {
  const invalidate = useClientsInvalidation();
  return useMutation({
    mutationFn: (input: ClientCreate) => createClient(input),
    onSuccess: invalidate,
  });
}

export function useUpdateClient() {
  const invalidate = useClientsInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClientUpdate }) =>
      updateClient(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteClient() {
  const invalidate = useClientsInvalidation();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: invalidate,
  });
}
