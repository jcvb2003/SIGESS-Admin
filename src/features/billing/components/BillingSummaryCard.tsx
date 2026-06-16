import type { ReactNode } from 'react';
import { formatDate } from '@/shared/utils/date';
import type { BillingAccount, BillingSubscription } from '../types';
import {
  LIFECYCLE_LABEL,
  INTERVAL_LABEL,
} from '../types';

function InfoRow({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 py-2.5 last:border-0">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="text-right text-sm text-foreground">{children}</div>
    </div>
  );
}

interface BillingSummaryCardProps {
  account: BillingAccount;
  subscription: BillingSubscription | null;
}

export function BillingSummaryCard({ account, subscription }: Readonly<BillingSummaryCardProps>) {
  return (
    <div className="divide-y divide-border/40">
      <InfoRow label="Status">
        <span className="font-medium">{LIFECYCLE_LABEL[account.lifecycle_status]}</span>
      </InfoRow>

      <InfoRow label="Provider ID">
        {account.provider_customer_id ? (
          <code className="rounded bg-secondary/50 px-1.5 py-0.5 text-xs font-mono">
            {account.provider_customer_id}
          </code>
        ) : (
          <span className="text-muted-foreground">Não provisionado</span>
        )}
      </InfoRow>

      {account.trial_ends_at && (
        <InfoRow label="Vencimento trial">
          {formatDate(account.trial_ends_at)}
        </InfoRow>
      )}

      <InfoRow label="Assinatura">
        {subscription ? (
          <span>
            {INTERVAL_LABEL[subscription.interval]} —{' '}
            {subscription.amount.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </span>
        ) : (
          <span className="text-muted-foreground">Sem assinatura</span>
        )}
      </InfoRow>

      <InfoRow label="Próxima cobrança">
        {subscription?.next_billing_date ? (
          {formatDate(subscription.next_billing_date)}
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </InfoRow>
    </div>
  );
}
