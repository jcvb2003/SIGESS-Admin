import { useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Tenant } from '@/features/clients/types';
import { useBillingOverview, useBillingActions } from '../hooks';
import { BillingSummaryCard } from './BillingSummaryCard';
import { BillingActionsRow } from './BillingActionsRow';
import { ChargesTable } from './ChargesTable';
import { NewChargeDialog } from './NewChargeDialog';
import { ProvisionAccountDialog } from './ProvisionAccountDialog';
import { LIFECYCLE_LABEL } from '../types';

interface BillingAccountCardProps {
  cliente: Tenant;
}

export function BillingAccountCard({ cliente }: Readonly<BillingAccountCardProps>) {
  const adminClientId = cliente.id;

  const { data, isLoading, error } = useBillingOverview(adminClientId);
  const { startTrial, syncAccount } = useBillingActions(adminClientId);

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className="flex h-20 items-center justify-center p-5">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-5">
        <p className="text-sm text-destructive">
          Erro ao carregar dados de cobrança: {error instanceof Error ? error.message : String(error)}
        </p>
      </Card>
    );
  }

  const { account, subscription, charges } = data ?? { account: null, subscription: null, charges: [] };

  if (!account) {
    return (
      <>
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cobrança
              </p>
            </div>
            <Button size="sm" onClick={() => setProvisionOpen(true)}>
              Provisionar conta
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Este cliente ainda não possui uma conta de cobrança.
          </p>
        </Card>
        <ProvisionAccountDialog
          cliente={cliente}
          open={provisionOpen}
          onOpenChange={setProvisionOpen}
        />
      </>
    );
  }

  const handleStartTrial = () => {
    startTrial.mutate(undefined, {
      onSuccess: () => toast.success('Trial iniciado'),
    });
  };

  const handleSync = () => {
    syncAccount.mutate(undefined, {
      onSuccess: () => toast.success('Cobrança sincronizada'),
    });
  };

  return (
    <>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cobrança
          </p>
          <span className="ml-auto rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            {LIFECYCLE_LABEL[account.lifecycle_status]}
          </span>
        </div>

        <BillingSummaryCard account={account} subscription={subscription} />

        <div className="mt-4">
          <BillingActionsRow
            adminClientId={adminClientId}
            lifecycleStatus={account.lifecycle_status}
            onStartTrial={handleStartTrial}
            isStartingTrial={startTrial.isPending}
            onNewCharge={() => setChargeOpen(true)}
            onSync={handleSync}
            isSyncing={syncAccount.isPending}
          />
        </div>

        {charges.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Últimas cobranças
            </p>
            <ChargesTable charges={charges} />
          </div>
        )}
      </Card>

      <NewChargeDialog
        adminClientId={adminClientId}
        open={chargeOpen}
        onOpenChange={setChargeOpen}
      />
    </>
  );
}
