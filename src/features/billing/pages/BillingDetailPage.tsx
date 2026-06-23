import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PlusCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useClienteDetail } from '@/features/clients/hooks/useClienteDetail';
import { useBillingOverview, useAllBillingCharges } from '../hooks/useBillingOverview';
import { useBillingPlans } from '../hooks/useBillingPlans';
import { useBillingActions } from '../hooks/useBillingActions';
import { BillingHeader } from '../components/BillingHeader';
import { ContractCard } from '../components/ContractCard';
import { PlannedPlanCard } from '../components/PlannedPlanCard';
import { BillingBlockCard } from '../components/BillingBlockCard';
import { FullChargesTable } from '../components/FullChargesTable';
import { GenerateTokenButton } from '../components/GenerateTokenButton';
import { CreateSubscriptionDialog } from '../components/CreateSubscriptionDialog';
import { NewChargeDialog } from '../components/NewChargeDialog';
import { ProvisionAccountDialog } from '../components/ProvisionAccountDialog';

export default function BillingDetailPage() {
  const { id: projectId, clienteId } = useParams<{ id: string; clienteId: string }>();

  const adminClientId = clienteId!;

  const { data: cliente } = useClienteDetail(adminClientId);
  const { data, isLoading, error } = useBillingOverview(adminClientId);
  const { data: plans = [] } = useBillingPlans();
  const { data: allCharges = [], isLoading: loadingCharges } = useAllBillingCharges(data?.account?.id);
  const { syncAccount, cancelCharge, prorrogarCharge, cancelSubscription, suspendSubscription, resumeSubscription, clearPlannedPlan, updateCommercialMode } = useBillingActions(adminClientId);

  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);

  const handleSync = () => {
    syncAccount.mutate(undefined, {
      onSuccess: () => toast.success('Cobrança sincronizada'),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">
          Erro ao carregar dados de billing: {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const { account, subscription } = data ?? { account: null, subscription: null };

  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <BillingHeader
        nomeEntidade={cliente?.nome_entidade ?? adminClientId}
        projectId={projectId!}
        clienteId={adminClientId}
        onSync={handleSync}
        isSyncing={syncAccount.isPending}
      />

      {!account ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-3">
            Este cliente ainda não possui uma conta de cobrança.
          </p>
          <Button size="sm" onClick={() => setProvisionOpen(true)}>
            Provisionar conta
          </Button>
        </Card>
      ) : (
        <>
          <ContractCard
            account={account}
            subscription={subscription}
            commercialMode={account.commercial_mode}
            onCreateSubscription={() => setSubscriptionOpen(true)}
            onChangePlan={() => setChangePlanOpen(true)}
            onReprovision={() => setProvisionOpen(true)}
            onSuspendSubscription={() =>
              suspendSubscription.mutate(subscription!.id, {
                onSuccess: () => toast.success('Assinatura suspensa'),
              })
            }
            onResumeSubscription={() =>
              resumeSubscription.mutate(subscription!.id, {
                onSuccess: () => toast.success('Assinatura reativada'),
              })
            }
            isSuspending={suspendSubscription.isPending}
            isResuming={resumeSubscription.isPending}
            onCancelSubscription={() => {
              if (!subscription) return;
              cancelSubscription.mutate(subscription.id, {
                onSuccess: () => toast.success('Assinatura cancelada'),
              });
            }}
            onUpdateMode={(newMode) =>
              updateCommercialMode.mutate(newMode, {
                onSuccess: () => toast.success('Modo comercial atualizado'),
              })
            }
            isUpdatingMode={updateCommercialMode.isPending}
            isCancellingSubscription={cancelSubscription.isPending}
          />

          {account.next_plan_id && (
            <PlannedPlanCard
              account={account}
              plans={plans}
              onClearSchedule={() => clearPlannedPlan.mutate()}
              isClearing={clearPlannedPlan.isPending}
            />
          )}

          <BillingBlockCard
            account={account}
            adminClientId={adminClientId}
            hasRecurringSubscription={!!subscription && subscription.billing_status !== 'cancelled'}
          />

          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobranças</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setChargeOpen(true)}>
                  <PlusCircle className="mr-2 h-3.5 w-3.5" />
                  Nova avulsa
                </Button>
                {account.commercial_mode !== 'manual' && (
                  <GenerateTokenButton adminClientId={adminClientId} charges={allCharges} />
                )}
              </div>
            </div>

            {loadingCharges ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <FullChargesTable
                charges={allCharges}
                onCancelCharge={(providerChargeId) =>
                  cancelCharge.mutate(providerChargeId, {
                    onSuccess: () => toast.success('Cobrança cancelada'),
                  })
                }
                isCancellingId={cancelCharge.isPending ? (cancelCharge.variables ?? null) : null}
                onProrrogarCharge={(providerChargeId, newDueDate) =>
                  prorrogarCharge.mutate({ provider_charge_id: providerChargeId, new_due_date: newDueDate }, {
                    onSuccess: () => toast.success('Cobrança prorrogada'),
                  })
                }
                isProrrogandoId={prorrogarCharge.isPending ? (prorrogarCharge.variables?.provider_charge_id ?? null) : null}
              />
            )}
          </Card>
        </>
      )}

      <CreateSubscriptionDialog
        adminClientId={adminClientId}
        open={subscriptionOpen}
        onOpenChange={setSubscriptionOpen}
      />
      <CreateSubscriptionDialog
        adminClientId={adminClientId}
        mode="change"
        subscription={subscription}
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
      />
      <NewChargeDialog
        adminClientId={adminClientId}
        open={chargeOpen}
        onOpenChange={setChargeOpen}
      />
      {cliente && (
        <ProvisionAccountDialog
          cliente={cliente}
          open={provisionOpen}
          onOpenChange={setProvisionOpen}
        />
      )}
    </div>
  );
}
