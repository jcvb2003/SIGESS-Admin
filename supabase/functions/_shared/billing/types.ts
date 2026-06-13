// Internal domain types — never Asaas-specific strings outside this layer.

export type BillingProviderName = 'asaas' | 'stub';

export type BillingAccountLifecycleStatus =
  | 'draft'
  | 'provisioning'
  | 'trial_active'
  | 'payment_pending'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled';

export type BillingSubscriptionStatus =
  | 'trialing'
  | 'pending_payment'
  | 'active'
  | 'overdue'
  | 'cancelled';

export type BillingChargeStatus =
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'failed';

export type BillingInterval = 'monthly' | 'annual';

export type BillingChargeType =
  | 'subscription_renewal'
  | 'tier_upgrade'
  | 'one_off'
  | 'adjustment';

// Normalized shapes returned by the provider adapter.
// The rest of the system only ever sees these — never raw provider payloads.

export interface ProviderCustomer {
  providerCustomerId: string;
}

export interface ProviderSubscription {
  providerSubscriptionId: string;
  billingStatus: BillingSubscriptionStatus;
  nextBillingDate?: string; // ISO date
}

export interface ProviderCharge {
  providerChargeId: string;
  status: BillingChargeStatus;
  amount: number;
  dueDate: string;           // ISO date
  paymentUrl?: string;
  paidAt?: string;           // ISO datetime
}

export interface BillingWebhookEvent {
  providerEventId: string;
  eventType: string;                        // canonical internal type (e.g. 'charge.paid')
  rawEventType: string;                     // original string from provider (audit only)
  providerChargeId?: string;
  providerSubscriptionId?: string;
  chargeStatus?: BillingChargeStatus;
  subscriptionStatus?: BillingSubscriptionStatus;
  paidAt?: string;                          // ISO datetime — use provider value, never fabricate
}
