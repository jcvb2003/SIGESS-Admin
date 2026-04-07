import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as settingsService from "@/services/settings.service";

export const settingsKeys = {
  all: ["settings"] as const,
  accounts: ["settings", "accounts"] as const,
  system: ["settings", "system"] as const,
};

export function useSupabaseAccounts() {
  return useQuery({
    queryKey: settingsKeys.accounts,
    queryFn: settingsService.listSupabaseAccounts,
  });
}

export function useCreateSupabaseAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsService.createSupabaseAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.accounts });
    },
  });
}

export function useUpdateSupabaseAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, account }: { id: string, account: Partial<settingsService.SupabaseAccount> }) => 
      settingsService.updateSupabaseAccount(id, account),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.accounts });
    },
  });
}

export function useDeleteSupabaseAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: settingsService.deleteSupabaseAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.accounts });
    },
  });
}

export function useSystemSettings() {
  return useQuery({
    queryKey: settingsKeys.system,
    queryFn: settingsService.listSystemSettings,
  });
}

export function useUpdateSystemSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string, value: string }) => 
      settingsService.updateSystemSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.system });
    },
  });
}
