import { useQuery } from '@tanstack/react-query';
import { getBillingAccount, getActiveSubscription, getBillingCharges } from '../services/billing.service';
import type { BillingAccount, BillingCharge, BillingSubscription } from '../types';

export const billingOverviewKey = (adminClientId: string) =>
  ['billing', 'overview', adminClientId] as const;

interface BillingOverview {
  account: BillingAccount | null;
  subscription: BillingSubscription | null;
  charges: BillingCharge[];
}

export function useBillingOverview(adminClientId: string) {
  return useQuery<BillingOverview>({
    queryKey: billingOverviewKey(adminClientId),
    queryFn: async () => {
      const account = await getBillingAccount(adminClientId);
      if (!account) return { account: null, subscription: null, charges: [] };

      const [subscription, charges] = await Promise.all([
        getActiveSubscription(account.id),
        getBillingCharges(account.id),
      ]);

      return { account, subscription, charges };
    },
    enabled: Boolean(adminClientId),
  });
}
