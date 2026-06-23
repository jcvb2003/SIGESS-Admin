import { useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useBillingActions } from '../hooks';
import type { BillingAccount } from '../types';

interface BillingBlockCardProps {
  account: BillingAccount;
  adminClientId: string;
  hasRecurringSubscription?: boolean;
}

type PendingAction =
  | { type: 'block'; reason: 'billing_delinquent' | 'manual_suspend' }
  | { type: 'unblock' }
  | null;

export function BillingBlockCard({ account, adminClientId, hasRecurringSubscription = false }: Readonly<BillingBlockCardProps>) {
  const { setBillingBlock, clearBillingBlock } = useBillingActions(adminClientId);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const isMutating = setBillingBlock.isPending || clearBillingBlock.isPending;

  const handleConfirm = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'block') {
      setBillingBlock.mutate(pendingAction.reason, {
        onSuccess: () => toast.success('Acesso bloqueado'),
      });
    } else {
      clearBillingBlock.mutate(undefined, {
        onSuccess: () => toast.success('Acesso liberado'),
      });
    }
    setPendingAction(null);
  };

  const stateConfig = account.is_billing_blocked
    ? account.billing_blocked_reason === 'billing_delinquent'
      ? {
          icon: <ShieldAlert className="h-4 w-4 text-amber-600" />,
          label: 'Inadimplente',
          className: 'text-amber-700 dark:text-amber-400',
        }
      : {
          icon: <ShieldX className="h-4 w-4 text-destructive" />,
          label: 'Suspenso manualmente',
          className: 'text-destructive',
        }
    : {
        icon: <ShieldCheck className="h-4 w-4 text-emerald-600" />,
        label: 'Acesso liberado',
        className: 'text-emerald-700 dark:text-emerald-400',
      };

  const dialogTitle = pendingAction?.type === 'unblock'
    ? 'Liberar acesso'
    : pendingAction?.type === 'block' && pendingAction.reason === 'billing_delinquent'
      ? 'Marcar como inadimplente'
      : 'Suspender manualmente';

  const dialogDescription = pendingAction?.type === 'unblock'
    ? 'O acesso será liberado e o lifecycle_status voltará para ativo.'
    : pendingAction?.type === 'block' && pendingAction.reason === 'billing_delinquent'
      ? 'O cliente será marcado como inadimplente. O acesso ao sistema será bloqueado.'
      : 'O cliente será suspenso manualmente e o lifecycle_status mudará para suspended.';

  return (
    <>
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
                onClick={() => setPendingAction({ type: 'unblock' })}
              >
                Liberar acesso
              </Button>
            ) : (
              <>
                {!hasRecurringSubscription && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-700 border-amber-400 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-600 dark:hover:bg-amber-900/30"
                    disabled={isMutating}
                    onClick={() => setPendingAction({ type: 'block', reason: 'billing_delinquent' })}
                  >
                    Marcar inadimplente
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  disabled={isMutating}
                  onClick={() => setPendingAction({ type: 'block', reason: 'manual_suspend' })}
                >
                  Suspender
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={
                pendingAction?.type === 'block'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={handleConfirm}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
