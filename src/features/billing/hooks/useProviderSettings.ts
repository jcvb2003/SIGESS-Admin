import { useQuery } from '@tanstack/react-query';
import { getProviderSettings } from '../services/billing.service';
import type { ProviderSettings } from '../services/billing.service';

export const providerSettingsKey = ['billing', 'provider-settings'] as const;

export function useProviderSettings() {
  return useQuery<ProviderSettings | null>({
    queryKey: providerSettingsKey,
    queryFn: getProviderSettings,
    staleTime: 60_000,
  });
}
