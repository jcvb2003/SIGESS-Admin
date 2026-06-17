import { CalendarCheck, Loader2, PlusCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GenerateTokenButton } from './GenerateTokenButton';
import type { BillingAccountLifecycleStatus, BillingCharge } from '../types';

interface BillingActionsRowProps {
  adminClientId: string;
  lifecycleStatus: BillingAccountLifecycleStatus;
  charges: BillingCharge[];
  onCreateSubscription: () => void;
  onReprovision: () => void;
  onNewCharge: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function BillingActionsRow({
  adminClientId,
  lifecycleStatus,
  charges,
  onCreateSubscription,
  onReprovision,
  onNewCharge,
  onSync,
  isSyncing,
}: Readonly<BillingActionsRowProps>) {
  const canSubscribe = lifecycleStatus === 'draft' || lifecycleStatus === 'trial_active';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(lifecycleStatus === 'draft' || lifecycleStatus === 'trial_active') && (
        <Button variant="outline" size="sm" onClick={onReprovision}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Re-provisionar
        </Button>
      )}

      {canSubscribe && (
        <Button variant="default" size="sm" onClick={onCreateSubscription}>
          <CalendarCheck className="mr-2 h-3.5 w-3.5" />
          Criar assinatura
        </Button>
      )}

      <Button variant="outline" size="sm" onClick={onNewCharge}>
        <PlusCircle className="mr-2 h-3.5 w-3.5" />
        Nova cobrança avulsa
      </Button>

      <GenerateTokenButton adminClientId={adminClientId} charges={charges} />

      <Button
        variant="outline"
        size="sm"
        onClick={onSync}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
        )}
        Sincronizar cobrança
      </Button>
    </div>
  );
}
