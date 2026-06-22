import { useState } from 'react';
import { AlertTriangle, ArrowRight, CreditCard, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Tenant } from '@/features/clients/types';
import { useBillingOverview, useProviderSettings } from '../hooks';
import { ProvisionAccountDialog } from './ProvisionAccountDialog';
import { COMMERCIAL_MODE_LABEL, LIFECYCLE_LABEL } from '../types';

interface BillingAccountCardProps {
  cliente: Tenant;
}

export function BillingAccountCard({ cliente }: Readonly<BillingAccountCardProps>) {
  const adminClientId = cliente.id;
  const { id: projectId, clienteId } = useParams<{ id: string; clienteId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useBillingOverview(adminClientId);
  const { data: providerSettings } = useProviderSettings();
  const [provisionOpen, setProvisionOpen] = useState(false);

  const billingRoute = `/clients/${projectId}/clientes/${clienteId}/billing`;

  if (isLoading) {
    return (
      <Card className="flex h-16 items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <p className="text-sm text-destructive">
          Erro ao carregar cobrança: {error instanceof Error ? error.message : String(error)}
        </p>
      </Card>
    );
  }

  const { account, subscription } = data ?? { account: null, subscription: null };

  if (!account) {
    return (
      <>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobrança</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setProvisionOpen(true)}>
              Provisionar conta
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma conta de cobrança configurada.</p>
        </Card>
        <ProvisionAccountDialog cliente={cliente} open={provisionOpen} onOpenChange={setProvisionOpen} />
      </>
    );
  }

  const providerMismatch =
    providerSettings !== undefined &&
    providerSettings !== null &&
    account.provider !== providerSettings.provider;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cobrança</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-foreground">
            {COMMERCIAL_MODE_LABEL[account.commercial_mode]}
          </span>
          <span className="rounded-full bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-foreground">
            {LIFECYCLE_LABEL[account.lifecycle_status]}
          </span>
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => navigate(billingRoute)}>
            Ver billing completo
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {subscription && (
        <p className="mt-2 text-sm text-muted-foreground">
          {subscription.next_billing_date
            ? `Próxima cobrança: ${subscription.next_billing_date}`
            : 'Assinatura ativa'}
        </p>
      )}

      {account.is_billing_blocked && (
        <p className="mt-2 text-xs font-medium text-destructive">
          ⚠ Acesso bloqueado por {account.billing_blocked_reason === 'billing_delinquent' ? 'inadimplência' : 'suspensão manual'}
        </p>
      )}

      {providerMismatch && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700/50 dark:bg-amber-950/30">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            Provider desatualizado — conta em <span className="font-mono">{account.provider}</span>, atual é <span className="font-mono">{providerSettings!.provider}</span>. Acesse billing para re-provisionar.
          </p>
        </div>
      )}
    </Card>
  );
}
