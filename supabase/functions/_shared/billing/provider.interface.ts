import type {
  BillingInterval,
  BillingWebhookEvent,
  ProviderCharge,
  ProviderCustomer,
  ProviderSubscription,
} from './types.ts';

// ─── Input types ──────────────────────────────────────────────────────────────

export interface EnsureCustomerInput {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  externalRef?: string; // admin_client_id for cross-reference
}

export interface CreateSubscriptionInput {
  providerCustomerId: string;
  amount: number;
  interval: BillingInterval;
  nextDueDate: string;   // ISO date
  description?: string;
}

export interface CreateChargeInput {
  providerCustomerId: string;
  amount: number;
  dueDate: string;       // ISO date
  description: string;
  billingType?: 'BOLETO' | 'PIX' | 'CREDIT_CARD';
}

export interface CancelSubscriptionInput {
  providerSubscriptionId: string;
}

export interface CancelChargeInput {
  providerChargeId: string;
}

export interface FetchSubscriptionInput {
  providerSubscriptionId: string;
}

export interface FetchChargeInput {
  providerChargeId: string;
}

export interface ParseWebhookInput {
  rawBody: string;
  headers: Record<string, string>;
}

// ─── Contract ─────────────────────────────────────────────────────────────────

export interface BillingProvider {
  // Idempotent: creates or returns existing customer for the given cpfCnpj.
  ensureCustomer(input: EnsureCustomerInput): Promise<ProviderCustomer>;

  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<void>;

  createCharge(input: CreateChargeInput): Promise<ProviderCharge>;
  cancelCharge(input: CancelChargeInput): Promise<void>;

  fetchSubscription(input: FetchSubscriptionInput): Promise<ProviderSubscription>;
  fetchCharge(input: FetchChargeInput): Promise<ProviderCharge>;

  // Parses and normalizes an incoming webhook payload.
  // Throws if signature is invalid or payload is unrecognized.
  parseWebhookEvent(input: ParseWebhookInput): BillingWebhookEvent;
}
