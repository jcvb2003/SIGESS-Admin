export type CommercialMode = 'manual' | 'recorrente_mensal' | 'anual';

export const COMMERCIAL_MODE_LABEL: Record<CommercialMode, string> = {
  manual:            'Manual',
  recorrente_mensal: 'Mensal',
  anual:             'Anual',
};

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

export interface BillingAccount {
  id: string;
  admin_client_id: string;
  provider: string;
  provider_customer_id: string | null;
  lifecycle_status: BillingAccountLifecycleStatus;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  current_plan_id: string | null;
  commercial_mode: CommercialMode;
  next_plan_id: string | null;
  next_plan_effective_date: string | null;
  is_billing_blocked: boolean;
  billing_blocked_reason: 'billing_delinquent' | 'manual_suspend' | null;
  created_at: string;
  updated_at: string;
}

export interface BillingSubscription {
  id: string;
  billing_account_id: string;
  plan_id: string;
  billing_status: BillingSubscriptionStatus;
  interval: BillingInterval;
  amount: number;
  next_billing_date: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface BillingCharge {
  id: string;
  billing_account_id: string;
  provider_charge_id: string | null;
  type: BillingChargeType;
  status: BillingChargeStatus;
  amount: number;
  due_date: string;
  paid_at: string | null;
  description: string | null;
  payment_url: string | null;
  created_at: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  max_socios_to: number | null;
  price_monthly: number;
  price_annual: number;
  effective_from: string;
  active: boolean;
}

export const LIFECYCLE_LABEL: Record<BillingAccountLifecycleStatus, string> = {
  draft:           'Rascunho',
  provisioning:    'Provisionando',
  trial_active:    'Trial',
  payment_pending: 'Aguardando pgto',
  active:          'Ativo',
  past_due:        'Inadimplente',
  suspended:       'Suspenso',
  cancelled:       'Cancelado',
};

export const CHARGE_STATUS_LABEL: Record<BillingChargeStatus, string> = {
  pending:   'Pendente',
  paid:      'Pago',
  overdue:   'Vencido',
  cancelled: 'Cancelado',
  failed:    'Falhou',
};

export const CHARGE_TYPE_LABEL: Record<BillingChargeType, string> = {
  subscription_renewal: 'Renovação',
  tier_upgrade:         'Upgrade',
  one_off:              'Avulsa',
  adjustment:           'Ajuste',
};

export const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: 'Mensal',
  annual:  'Anual',
};
