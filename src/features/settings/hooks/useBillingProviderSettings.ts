import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeBillingAction } from "@/features/billing/services/billing.service";

export interface ProviderSettingsMeta {
  provider: string;
  asaas_sandbox: boolean;
  api_key_configured: boolean;
  webhook_token_configured: boolean;
  updated_at: string | null;
  updated_by: string | null;
  source: "db" | "env";
}

export interface UpsertProviderSettingsInput {
  provider: string;
  asaas_sandbox: boolean;
  asaas_api_key?: string;
  asaas_webhook_token?: string;
}

const QUERY_KEY = ["settings", "billing-provider"] as const;

async function getProviderSettings(): Promise<ProviderSettingsMeta> {
  return invokeBillingAction("get_provider_settings", {}) as Promise<ProviderSettingsMeta>;
}

async function upsertProviderSettings(input: UpsertProviderSettingsInput): Promise<void> {
  await invokeBillingAction("upsert_provider_settings", input as Record<string, unknown>);
}

export function useBillingProviderSettings() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: getProviderSettings });
}

export function useUpsertBillingProviderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProviderSettingsInput) => upsertProviderSettings(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
