import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  getAllBillingAccountsSummary,
  getOpenChargesSummary,
  invokeSyncAll,
} from '../services/billing.service';
import { BillingKPICards } from '../components/BillingKPICards';
import { ClientsBillingTable } from '../components/ClientsBillingTable';
import { UpcomingChargesCard } from '../components/UpcomingChargesCard';

async function getTenantsProjectMap(): Promise<Record<string, string>> {
  const { data } = await supabase.from('tenants').select('id, project_id');
  const map: Record<string, string> = {};
  (data ?? []).forEach((t: any) => { if (t.project_id) map[t.id] = t.project_id; });
  return map;
}

async function getMRR(): Promise<number> {
  const { data } = await supabase
    .from('billing_subscriptions')
    .select('amount, interval')
    .in('billing_status', ['active', 'pending_payment'])
    .eq('interval', 'monthly');
  return ((data ?? []) as { amount: number }[]).reduce((sum, s) => sum + Number(s.amount), 0);
}

export default function BillingOverviewPage() {
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading: loadingAccounts } =
    useQuery({ queryKey: ['billing', 'overview-all'], queryFn: getAllBillingAccountsSummary });

  const { data: openCharges = [], isLoading: loadingCharges } =
    useQuery({ queryKey: ['billing', 'open-charges'], queryFn: getOpenChargesSummary });

  const { data: projectIdByClientId = {} } =
    useQuery({ queryKey: ['tenants', 'project-map'], queryFn: getTenantsProjectMap });

  const { data: mrr = 0 } =
    useQuery({ queryKey: ['billing', 'mrr'], queryFn: getMRR });

  const syncAll = useMutation({
    mutationFn: invokeSyncAll,
    onSuccess: (result) => {
      toast.success(`Sync concluído: ${result.synced}/${result.total} contas sincronizadas`);
      queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro no sync'),
  });

  const isLoading = loadingAccounts || loadingCharges;

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

        {isLoading ? (
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
