import { useState } from 'react';
import { CalendarCheck, XCircle } from 'lucide-react';
import { formatDate } from '@/shared/utils/date';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { BillingAccount, BillingSubscription, CommercialMode } from '../types';
import { COMMERCIAL_MODE_LABEL, LIFECYCLE_LABEL, INTERVAL_LABEL } from '../types';

function formatBRL(reais: number): string {
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const MODE_OPTIONS: { value: CommercialMode; label: string }[] = [
  { value: 'manual',            label: 'Manual' },
  { value: 'recorrente_mensal', label: 'Recorrente mensal' },
  { value: 'anual',             label: 'Anual' },
];

interface ContractCardProps {
  account: BillingAccount;
  subscription: BillingSubscription | null;
  commercialMode: CommercialMode;
  onCreateSubscription: () => void;
  onChangePlan: () => void;
  onCancelSubscription: () => void;
  onUpdateMode: (newMode: CommercialMode) => void;
  isUpdatingMode: boolean;
  isCancellingSubscription: boolean;
}

export function ContractCard({
  account,
  subscription,
  commercialMode,
  onCreateSubscription,
  onChangePlan,
  onCancelSubscription,
  onUpdateMode,
  isUpdatingMode,
  isCancellingSubscription,
}: Readonly<ContractCardProps>) {
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [pendingMode, setPendingMode] = useState<CommercialMode>(commercialMode);

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

  const canCancelSubscription =
    subscription !== null &&
    ['active', 'pending_payment', 'overdue'].includes(subscription.billing_status);

  // manual não pode voltar de recorrente/anual — filtrar opções proibidas
  const allowedModes = MODE_OPTIONS.filter((m) => {
    if (isRecorrente && m.value === 'manual') return false;
    return true;
  });

  const handleConfirmMode = () => {
    if (pendingMode === commercialMode) { setShowModeSelector(false); return; }
    if (!window.confirm(`Mudar modo para "${COMMERCIAL_MODE_LABEL[pendingMode]}"?`)) return;
    onUpdateMode(pendingMode);
    setShowModeSelector(false);
  };

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
        {subscription ? (
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
        ) : (
          <div>
            <p className="text-xs text-muted-foreground">Assinatura</p>
            <p className="text-sm text-muted-foreground">Sem assinatura ativa</p>
          </div>
        )}
      </div>

      {/* Ações contratuais */}
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
        {canCancelSubscription && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
            disabled={isCancellingSubscription}
            onClick={onCancelSubscription}
          >
            <XCircle className="mr-2 h-3.5 w-3.5" />
            Cancelar assinatura
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={isUpdatingMode}
          onClick={() => { setPendingMode(commercialMode); setShowModeSelector((v) => !v); }}
        >
          Mudar modo
        </Button>
      </div>

      {/* Seletor inline de modo */}
      {showModeSelector && (
        <div className="flex items-center gap-2 rounded-md border border-border/50 bg-secondary/20 p-3">
          <select
            value={pendingMode}
            onChange={(e) => setPendingMode(e.target.value as CommercialMode)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {allowedModes.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Button size="sm" onClick={handleConfirmMode} disabled={isUpdatingMode}>
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowModeSelector(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </Card>
  );
}
