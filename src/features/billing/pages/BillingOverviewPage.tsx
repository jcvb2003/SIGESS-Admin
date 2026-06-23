import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { invokeBillingAction, invokeSyncAll } from '../services/billing.service';
import { useBillingDashboard } from '../hooks/useBillingDashboard';
import { BillingKPICards } from '../components/BillingKPICards';
import { ClientsBillingTable } from '../components/ClientsBillingTable';
import { UpcomingChargesCard } from '../components/UpcomingChargesCard';
import { BillingEventsTable } from '../components/BillingEventsTable';

export default function BillingOverviewPage() {
  const queryClient = useQueryClient();
  const { accounts, openCharges, projectIdByClientId, mrr, isLoading, isError } = useBillingDashboard();

  const { data: stuckAccounts = [] } = useQuery({
    queryKey: ['billing', 'stuck-provisioning'],
    queryFn: async () => {
      const threshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('billing_accounts')
        .select('id, admin_client_id')
        .eq('lifecycle_status', 'provisioning')
        .lt('updated_at', threshold);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const retryEvent = useMutation({
    mutationFn: (eventId: string) =>
      invokeBillingAction('retry_webhook_event', { event_id: eventId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing', 'events'] });
      toast.success('Evento reprocessado');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao reprocessar'),
  });

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

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-secondary/60">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="events">Eventos</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {stuckAccounts.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-4 py-3 dark:border-amber-700/50 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  {stuckAccounts.length} conta(s) presa(s) em <code>provisioning</code> há mais de 10 minutos — acesse o cliente para re-provisionar.
                </p>
              </div>
            )}
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
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Inbox de webhooks do provider de billing (Asaas). Atualizado a cada 30 segundos.
              Eventos com status <strong>failed</strong> podem ser reprocessados individualmente.
            </p>
            <BillingEventsTable
              onRetry={retryEvent.mutate}
              retryingId={retryEvent.isPending ? (retryEvent.variables ?? null) : null}
            />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
