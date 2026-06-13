import { Loader2, PlusCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GenerateTokenButton } from './GenerateTokenButton';
import type { BillingAccountLifecycleStatus } from '../types';

interface BillingActionsRowProps {
  adminClientId: string;
  lifecycleStatus: BillingAccountLifecycleStatus;
  onStartTrial: () => void;
  isStartingTrial: boolean;
  onNewCharge: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function BillingActionsRow({
  adminClientId,
  lifecycleStatus,
  onStartTrial,
  isStartingTrial,
  onNewCharge,
  onSync,
  isSyncing,
}: Readonly<BillingActionsRowProps>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {lifecycleStatus === 'draft' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onStartTrial}
          disabled={isStartingTrial}
        >
          {isStartingTrial ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : null}
          Iniciar trial
        </Button>
      )}

      <Button variant="outline" size="sm" onClick={onNewCharge}>
        <PlusCircle className="mr-2 h-3.5 w-3.5" />
        Nova cobrança avulsa
      </Button>

      <GenerateTokenButton adminClientId={adminClientId} />

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
