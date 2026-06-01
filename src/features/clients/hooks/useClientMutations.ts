import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateCliente, deleteCliente } from "@/services/commercial-tenants.service";
import { proxyAction } from "@/services/projects.service";
import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";
import type { ClienteUpdate } from "@/features/clients/types";
import { clientsQueryKey } from "./useClients";

function useClientsInvalidation() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: clientsQueryKey });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useUpdateClient() {
  const invalidate = useClientsInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClienteUpdate }) =>
      updateCliente(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteClient() {
  const invalidate = useClientsInvalidation();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase.from("projetos").delete().eq("id", projectId);
      if (error) throw handleSupabaseError(error);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateClientUserLicense(clientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: Record<string, unknown> }) =>
      proxyAction(clientId, "update-client-member", { userId, updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
    },
  });
}
