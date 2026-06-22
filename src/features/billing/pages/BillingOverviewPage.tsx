import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { invokeSyncAll } from '../services/billing.service';
import { useBillingDashboard } from '../hooks/useBillingDashboard';
import { BillingKPICards } from '../components/BillingKPICards';
import { ClientsBillingTable } from '../components/ClientsBillingTable';
import { UpcomingChargesCard } from '../components/UpcomingChargesCard';

export default function BillingOverviewPage() {
  const queryClient = useQueryClient();
  const { accounts, openCharges, projectIdByClientId, mrr, isLoading, isError } = useBillingDashboard();

  const syncAll = useMutation({
    mutationFn: invokeSyncAll,
    onSuccess: (result) => {
      if (result.skipped) {
        toast.info('Sync ignorado: provider configurado não é Asaas');
        return;
      }
      const failed = (result.results ?? []).filter((r) => !r.ok).length;
      if (failed > 0) {
        toast.warning(
          `Sync concluído com erros: ${result.synced}/${result.total} contas OK, ${failed} falharam`,
        );
      } else {
        toast.success(`Sync concluído: ${result.synced}/${result.total} contas sincronizadas`);
      }
      queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro no sync'),
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing</h1>
            <p className="text-sm text-muted-foreground">Visão geral de todas as contas comerciais</p>
          </div>
          <Button variant="outline" size="sm" disabled={syncAll.isPending} onClick={() => syncAll.mutate()}>
            {syncAll.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sincronizar todos
          </Button>
        </div>

        {isError ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Erro ao carregar dados de billing</p>
            <p className="text-xs text-muted-foreground">
              Uma ou mais queries falharam. Verifique a conexão e recarregue a página.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">

            <BillingKPICards accounts={accounts} mrr={mrr} />
            <UpcomingChargesCard charges={openCharges} />
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Clientes ({accounts.length})
              </p>
              <ClientsBillingTable accounts={accounts} projectIdByClientId={projectIdByClientId} />
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
