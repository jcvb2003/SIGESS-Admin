import { CalendarCheck, Loader2, PlusCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GenerateTokenButton } from './GenerateTokenButton';
import type { BillingAccountLifecycleStatus, BillingCharge, CommercialMode } from '../types';

interface BillingActionsRowProps {
  adminClientId: string;
  lifecycleStatus: BillingAccountLifecycleStatus;
  commercialMode: CommercialMode;
  hasSubscription: boolean;
  charges: BillingCharge[];
  onCreateSubscription: () => void;
  onChangePlan: () => void;
  onReprovision: () => void;
  onNewCharge: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function BillingActionsRow({
  adminClientId,
  lifecycleStatus,
  commercialMode,
  hasSubscription,
  charges,
  onCreateSubscription,
  onChangePlan,
  onReprovision,
  onNewCharge,
  onSync,
  isSyncing,
}: Readonly<BillingActionsRowProps>) {
  const isManual = commercialMode === 'manual';

  const canReprovision =
    !isManual &&
    (lifecycleStatus === 'draft' || lifecycleStatus === 'trial_active' || lifecycleStatus === 'cancelled');

  const canCreateSubscription =
    !isManual &&
    (lifecycleStatus === 'draft' || lifecycleStatus === 'trial_active' || lifecycleStatus === 'cancelled');

  const canChangePlan =
    !isManual &&
    hasSubscription &&
    (lifecycleStatus === 'payment_pending' || lifecycleStatus === 'active' || lifecycleStatus === 'past_due');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canReprovision && (
        <Button variant="outline" size="sm" onClick={onReprovision}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Re-provisionar
        </Button>
      )}

      {canCreateSubscription && (
        <Button variant="default" size="sm" onClick={onCreateSubscription}>
          <CalendarCheck className="mr-2 h-3.5 w-3.5" />
          Criar assinatura
        </Button>
      )}

      {canChangePlan && (
        <Button variant="default" size="sm" onClick={onChangePlan}>
          <CalendarCheck className="mr-2 h-3.5 w-3.5" />
          Trocar plano
        </Button>
      )}

      <Button variant="outline" size="sm" onClick={onNewCharge}>
        <PlusCircle className="mr-2 h-3.5 w-3.5" />
        Nova cobrança avulsa
      </Button>

      {!isManual && <GenerateTokenButton adminClientId={adminClientId} charges={charges} />}

      {!isManual && (
        <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}
          Sincronizar cobrança
        </Button>
      )}
    </div>
  );
}
