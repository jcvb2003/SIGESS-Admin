import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useBillingActions } from '../hooks';
import type { BillingAccount } from '../types';

interface BillingBlockCardProps {
  account: BillingAccount;
  adminClientId: string;
}

export function BillingBlockCard({ account, adminClientId }: Readonly<BillingBlockCardProps>) {
  const { setBillingBlock, clearBillingBlock } = useBillingActions(adminClientId);

  const handleBlock = (reason: 'billing_delinquent' | 'manual_suspend') => {
    const label = reason === 'billing_delinquent' ? 'inadimplente' : 'suspenso manualmente';
    if (!window.confirm(`Confirmar: marcar este cliente como ${label}?`)) return;
    setBillingBlock.mutate(reason, {
      onSuccess: () => toast.success('Acesso bloqueado'),
    });
  };

  const handleUnblock = () => {
    if (!window.confirm('Confirmar: liberar o acesso deste cliente?')) return;
    clearBillingBlock.mutate(undefined, {
      onSuccess: () => toast.success('Acesso liberado'),
    });
  };

  const isMutating = setBillingBlock.isPending || clearBillingBlock.isPending;

  const stateConfig = account.is_billing_blocked
    ? account.billing_blocked_reason === 'billing_delinquent'
      ? {
          icon: <ShieldAlert className="h-4 w-4 text-amber-600" />,
          label: 'Inadimplente',
          className: 'text-amber-700 dark:text-amber-400',
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        }
      : {
          icon: <ShieldX className="h-4 w-4 text-destructive" />,
          label: 'Suspenso manualmente',
          className: 'text-destructive',
          badgeClass: 'bg-destructive/10 text-destructive',
        }
    : {
        icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
        label: 'Acesso liberado',
        className: 'text-emerald-700 dark:text-emerald-400',
        badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bloqueio de billing</p>
          <div className="flex items-center gap-1.5">
            {stateConfig.icon}
            <span className={`text-sm font-medium ${stateConfig.className}`}>{stateConfig.label}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {account.is_billing_blocked ? (
            <Button
              size="sm"
              variant="outline"
              disabled={isMutating}
              onClick={handleUnblock}
            >
              Liberar acesso
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="text-amber-700 border-amber-400 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-900/30"
                disabled={isMutating}
                onClick={() => handleBlock('billing_delinquent')}
              >
                Marcar inadimplente
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                disabled={isMutating}
                onClick={() => handleBlock('manual_suspend')}
              >
                Suspender
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
