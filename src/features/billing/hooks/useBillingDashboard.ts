import { useQuery } from '@tanstack/react-query';
import {
  getAllBillingAccountsSummary,
  getOpenChargesSummary,
  getTenantsProjectMap,
  getBillingMRR,
} from '../services/billing.service';

export function useBillingDashboard() {
  const accounts = useQuery({
    queryKey: ['billing', 'overview-all'],
    queryFn: getAllBillingAccountsSummary,
  });

  const openCharges = useQuery({
    queryKey: ['billing', 'open-charges'],
    queryFn: getOpenChargesSummary,
  });

  const projectMap = useQuery({
    queryKey: ['tenants', 'project-map'],
    queryFn: getTenantsProjectMap,
  });

  const mrr = useQuery({
    queryKey: ['billing', 'mrr'],
    queryFn: getBillingMRR,
  });

  return {
    accounts: accounts.data ?? [],
    openCharges: openCharges.data ?? [],
    projectIdByClientId: projectMap.data ?? {},
    mrr: mrr.data ?? 0,
    isLoading: accounts.isLoading || openCharges.isLoading,
    isError: accounts.isError || openCharges.isError,
  };
}
