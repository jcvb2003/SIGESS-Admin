import { useState } from 'react';
import { AlertTriangle, CreditCard, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Tenant } from '@/features/clients/types';
import { useBillingOverview, useBillingActions, useProviderSettings } from '../hooks';
import { BillingSummaryCard } from './BillingSummaryCard';
import { BillingActionsRow } from './BillingActionsRow';
import { ChargesTable } from './ChargesTable';
import { NewChargeDialog } from './NewChargeDialog';
import { CreateSubscriptionDialog } from './CreateSubscriptionDialog';
import { ProvisionAccountDialog } from './ProvisionAccountDialog';
import { LIFECYCLE_LABEL } from '../types';

interface BillingAccountCardProps {
  cliente: Tenant;
}

export function BillingAccountCard({ cliente }: Readonly<BillingAccountCardProps>) {
  const adminClientId = cliente.id;

  const { data, isLoading, error } = useBillingOverview(adminClientId);
  const { data: providerSettings } = useProviderSettings();
  const { cancelCharge, syncAccount } = useBillingActions(adminClientId);

  const [provisionOpen, setProvisionOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
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

  const providerMismatch =
    account !== null &&
    providerSettings !== undefined &&
    providerSettings !== null &&
    account.provider !== providerSettings.provider;

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

        <BillingSummaryCard account={account} subscription={subscription} cliente={cliente} />

        {providerMismatch && (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-700/50 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Provider desatualizado
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                Conta provisionada com <span className="font-mono">{account.provider}</span>, provider atual é <span className="font-mono">{providerSettings!.provider}</span>. Re-provisione para atualizar o cliente.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/40"
              onClick={() => setProvisionOpen(true)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Re-provisionar
            </Button>
          </div>
        )}

        <div className="mt-4">
          <BillingActionsRow
            adminClientId={adminClientId}
            lifecycleStatus={account.lifecycle_status}
            charges={charges}
            onCreateSubscription={() => setSubscriptionOpen(true)}
            onReprovision={() => setProvisionOpen(true)}
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
            <ChargesTable
              charges={charges}
              onCancelCharge={(providerChargeId) =>
                cancelCharge.mutate(providerChargeId, {
                  onSuccess: () => toast.success('Cobrança cancelada'),
                })
              }
              isCancellingId={cancelCharge.isPending ? (cancelCharge.variables ?? null) : null}
            />
          </div>
        )}
      </Card>

      <CreateSubscriptionDialog
        adminClientId={adminClientId}
        open={subscriptionOpen}
        onOpenChange={setSubscriptionOpen}
      />

      <NewChargeDialog
        adminClientId={adminClientId}
        open={chargeOpen}
        onOpenChange={setChargeOpen}
      />

      <ProvisionAccountDialog
        cliente={cliente}
        open={provisionOpen}
        onOpenChange={setProvisionOpen}
      />
    </>
  );
}
