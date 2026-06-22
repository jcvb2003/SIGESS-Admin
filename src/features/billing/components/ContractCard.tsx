import { CalendarCheck } from 'lucide-react';
import { formatDate } from '@/shared/utils/date';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { BillingAccount, BillingSubscription, CommercialMode } from '../types';
import { COMMERCIAL_MODE_LABEL, LIFECYCLE_LABEL, INTERVAL_LABEL } from '../types';

function formatBRL(reais: number): string {
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface ContractCardProps {
  account: BillingAccount;
  subscription: BillingSubscription | null;
  commercialMode: CommercialMode;
  onCreateSubscription: () => void;
  onChangePlan: () => void;
}

export function ContractCard({
  account,
  subscription,
  commercialMode,
  onCreateSubscription,
  onChangePlan,
}: Readonly<ContractCardProps>) {
  const isRecorrente = commercialMode === 'recorrente_mensal' || commercialMode === 'anual';

  const canCreateSubscription =
    isRecorrente &&
    (account.lifecycle_status === 'draft' ||
      account.lifecycle_status === 'trial_active' ||
      account.lifecycle_status === 'cancelled');

  const canChangePlan =
    isRecorrente &&
    subscription !== null &&
    (account.lifecycle_status === 'payment_pending' ||
      account.lifecycle_status === 'active' ||
      account.lifecycle_status === 'past_due');

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contrato</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            {COMMERCIAL_MODE_LABEL[commercialMode]}
          </span>
          <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            {LIFECYCLE_LABEL[account.lifecycle_status]}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Provider</p>
          <p className="font-mono text-sm">{account.provider}</p>
        </div>
        {subscription && (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Intervalo</p>
              <p className="text-sm">{INTERVAL_LABEL[subscription.interval]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="text-sm font-medium">{formatBRL(subscription.amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Próxima cobrança</p>
              <p className="text-sm">{formatDate(subscription.next_billing_date ?? '')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Início</p>
              <p className="text-sm">{formatDate(subscription.starts_at ?? '')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status assinatura</p>
              <p className="text-sm">{subscription.billing_status}</p>
            </div>
          </>
        )}
        {!subscription && (
          <div>
            <p className="text-xs text-muted-foreground">Assinatura</p>
            <p className="text-sm text-muted-foreground">Sem assinatura ativa</p>
          </div>
        )}
      </div>

      {(canCreateSubscription || canChangePlan) && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {canCreateSubscription && (
            <Button size="sm" onClick={onCreateSubscription}>
              <CalendarCheck className="mr-2 h-3.5 w-3.5" />
              Criar assinatura
            </Button>
          )}
          {canChangePlan && (
            <Button size="sm" variant="outline" onClick={onChangePlan}>
              <CalendarCheck className="mr-2 h-3.5 w-3.5" />
              Trocar plano
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
