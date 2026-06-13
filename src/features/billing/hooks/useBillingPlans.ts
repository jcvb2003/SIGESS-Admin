import { useQuery } from '@tanstack/react-query';
import { getBillingPlans } from '../services/billing.service';

export const billingPlansKey = ['billing', 'plans'] as const;

export function useBillingPlans() {
  return useQuery({
    queryKey: billingPlansKey,
    queryFn: getBillingPlans,
  });
}
