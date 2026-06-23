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

export interface UpdateSubscriptionInput extends CreateSubscriptionInput {
  providerSubscriptionId: string;
  updatePendingPayments?: boolean;
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

export interface ListSubscriptionChargesInput {
  providerSubscriptionId: string;
}

export interface CustomerExistsInput {
  providerCustomerId: string;
}

export interface UpdateChargeDueDateInput {
  providerChargeId: string;
  newDueDate: string; // ISO date YYYY-MM-DD
}

export interface SuspendSubscriptionInput {
  providerSubscriptionId: string;
}

export interface ResumeSubscriptionInput {
  providerSubscriptionId: string;
}

export interface ParseWebhookInput {
  rawBody: string;
  headers: Record<string, string>;
}

// ─── Contract ─────────────────────────────────────────────────────────────────

export interface BillingProvider {
  readonly name: string; // persisted in billing_accounts.provider — must be stable

  // Idempotent: creates or returns existing customer for the given cpfCnpj.
  // If the customer already exists for the tenant, provider data must be refreshed
  // with the latest local name/email/phone/cpfCnpj to avoid nomenclature drift.
  ensureCustomer(input: EnsureCustomerInput): Promise<ProviderCustomer>;

  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>;
  updateSubscription(input: UpdateSubscriptionInput): Promise<ProviderSubscription>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<void>;

  createCharge(input: CreateChargeInput): Promise<ProviderCharge>;
  cancelCharge(input: CancelChargeInput): Promise<void>;
  updateChargeDueDate(input: UpdateChargeDueDateInput): Promise<void>;

  // Pausa a assinatura sem cancelar (dunning). Reversível via resumeSubscription.
  suspendSubscription(input: SuspendSubscriptionInput): Promise<void>;
  resumeSubscription(input: ResumeSubscriptionInput): Promise<void>;

  fetchSubscription(input: FetchSubscriptionInput): Promise<ProviderSubscription>;
  fetchCharge(input: FetchChargeInput): Promise<ProviderCharge>;

  // Returns all charges for a subscription from the provider (for reconciliation/discovery).
  listSubscriptionCharges(input: ListSubscriptionChargesInput): Promise<ProviderCharge[]>;

  // Returns false when the customer no longer exists in the provider (404). Throws on other errors.
  customerExists(input: CustomerExistsInput): Promise<boolean>;

  // Parses and normalizes an incoming webhook payload.
  // Throws if signature is invalid or payload is unrecognized.
  parseWebhookEvent(input: ParseWebhookInput): BillingWebhookEvent;
}
