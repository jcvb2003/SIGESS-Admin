import type { BillingChargeStatus, BillingSubscriptionStatus } from './types.ts';

// ─── Charge status ────────────────────────────────────────────────────────────

const ASAAS_CHARGE_STATUS_MAP: Record<string, BillingChargeStatus> = {
  PENDING: 'pending',
  AWAITING_RISK_ANALYSIS: 'pending',
  APPROVED_BY_RISK_ANALYSIS: 'pending',
  RESTORED: 'pending',
  RECEIVED: 'paid',
  CONFIRMED: 'paid',
  RECEIVED_IN_CASH: 'paid',
  DUNNING_RECEIVED: 'paid',
  OVERDUE: 'overdue',
  DUNNING_REQUESTED: 'overdue',
  REFUNDED: 'cancelled',
  PARTIALLY_REFUNDED: 'cancelled',
  DELETED: 'cancelled',
  CHARGEBACK_REQUESTED: 'failed',
  CHARGEBACK_DISPUTE: 'failed',
  AWAITING_CHARGEBACK_REVERSAL: 'failed',
};

export function mapAsaasChargeStatus(asaasStatus: string): BillingChargeStatus {
  return ASAAS_CHARGE_STATUS_MAP[asaasStatus] ?? 'failed';
}

// ─── Subscription status ──────────────────────────────────────────────────────

const ASAAS_SUBSCRIPTION_STATUS_MAP: Record<string, BillingSubscriptionStatus> = {
  ACTIVE: 'active',
  INACTIVE: 'cancelled',
  EXPIRED: 'cancelled',
  TRIAL: 'trialing',
  OVERDUE: 'overdue',
};

export function mapAsaasSubscriptionStatus(asaasStatus: string): BillingSubscriptionStatus {
  return ASAAS_SUBSCRIPTION_STATUS_MAP[asaasStatus] ?? 'cancelled';
}

// ─── Canonical internal event types ──────────────────────────────────────────
// Used as billing_events.event_type — never Asaas event strings in business logic.

export const BILLING_EVENT_TYPES = {
  CHARGE_PAID: 'charge.paid',
  CHARGE_OVERDUE: 'charge.overdue',
  CHARGE_CANCELLED: 'charge.cancelled',
  CHARGE_FAILED: 'charge.failed',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
  SUBSCRIPTION_OVERDUE: 'subscription.overdue',
} as const;

// ─── Webhook event type mapping ───────────────────────────────────────────────

const ASAAS_WEBHOOK_EVENT_MAP: Record<string, string> = {
  PAYMENT_RECEIVED: BILLING_EVENT_TYPES.CHARGE_PAID,
  PAYMENT_CONFIRMED: BILLING_EVENT_TYPES.CHARGE_PAID,
  PAYMENT_RECEIVED_IN_CASH: BILLING_EVENT_TYPES.CHARGE_PAID,
  PAYMENT_DUNNING_RECEIVED: BILLING_EVENT_TYPES.CHARGE_PAID,
  PAYMENT_OVERDUE: BILLING_EVENT_TYPES.CHARGE_OVERDUE,
  PAYMENT_DELETED: BILLING_EVENT_TYPES.CHARGE_CANCELLED,
  PAYMENT_REFUNDED: BILLING_EVENT_TYPES.CHARGE_CANCELLED,
  PAYMENT_CHARGEBACK_REQUESTED: BILLING_EVENT_TYPES.CHARGE_FAILED,
  SUBSCRIPTION_RENEWED:      BILLING_EVENT_TYPES.SUBSCRIPTION_RENEWED,
  SUBSCRIPTION_DELETED:      BILLING_EVENT_TYPES.SUBSCRIPTION_CANCELLED,
  SUBSCRIPTION_INACTIVATED:  BILLING_EVENT_TYPES.SUBSCRIPTION_CANCELLED,
  PAYMENT_PARTIALLY_REFUNDED: BILLING_EVENT_TYPES.CHARGE_CANCELLED,
  PAYMENT_BANK_SLIP_CANCELLED: BILLING_EVENT_TYPES.CHARGE_CANCELLED,
};

export function mapAsaasWebhookEventType(asaasEvent: string): string {
  return ASAAS_WEBHOOK_EVENT_MAP[asaasEvent] ?? `provider.${asaasEvent.toLowerCase()}`;
}
