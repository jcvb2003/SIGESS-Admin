import { useState } from 'react';
import { AlertTriangle, CalendarCheck, RotateCcw, XCircle } from 'lucide-react';
import { formatDate } from '@/shared/utils/date';
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
import type { BillingAccount, BillingSubscription, CommercialMode } from '../types';
import { COMMERCIAL_MODE_LABEL, LIFECYCLE_LABEL, INTERVAL_LABEL } from '../types';

function formatBRL(reais: number): string {
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const MODE_OPTIONS: { value: CommercialMode; label: string }[] = [
  { value: 'manual',            label: 'Manual' },
  { value: 'recorrente_mensal', label: 'Recorrente mensal' },
  { value: 'anual',             label: 'Anual' },
];

interface ContractCardProps {
  account: BillingAccount;
  subscription: BillingSubscription | null;
  commercialMode: CommercialMode;
  onCreateSubscription: () => void;
  onChangePlan: () => void;
  onCancelSubscription: () => void;
  onUpdateMode: (newMode: CommercialMode) => void;
  onReprovision: () => void;
  isUpdatingMode: boolean;
  isCancellingSubscription: boolean;
}

export function ContractCard({
  account,
  subscription,
  commercialMode,
  onCreateSubscription,
  onChangePlan,
  onCancelSubscription,
  onUpdateMode,
  onReprovision,
  isUpdatingMode,
  isCancellingSubscription,
}: Readonly<ContractCardProps>) {
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [pendingMode, setPendingMode] = useState<CommercialMode>(commercialMode);
  const [confirmModeOpen, setConfirmModeOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const isRecorrente = commercialMode === 'recorrente_mensal' || commercialMode === 'anual';

  const needsReprovision =
    account.lifecycle_status === 'cancelled' && !account.provider_customer_id;

  const canCreateSubscription =
    isRecorrente &&
    !!account.provider_customer_id &&
    (account.lifecycle_status === 'draft' ||
      account.lifecycle_status === 'trial_active' ||
      account.lifecycle_status === 'cancelled');

  const canChangePlan =
    isRecorrente &&
    subscription !== null &&
    (account.lifecycle_status === 'payment_pending' ||
      account.lifecycle_status === 'active' ||
      account.lifecycle_status === 'past_due');

  const canCancelSubscription =
    subscription !== null &&
    ['active', 'pending_payment', 'overdue'].includes(subscription.billing_status);

  // manual não pode voltar de recorrente/anual
  const allowedModes = MODE_OPTIONS.filter((m) => {
    if (isRecorrente && m.value === 'manual') return false;
    return true;
  });

  const handleRequestModeChange = () => {
    if (pendingMode === commercialMode) { setShowModeSelector(false); return; }
    setConfirmModeOpen(true);
  };

  return (
    <>
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Contrato</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
              {COMMERCIAL_MODE_LABEL[commercialMode]}
            </span>
            <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
              {LIFECYCLE_LABEL[account.lifecycle_status]}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Provider</p>
            <p className="font-mono text-sm">{account.provider}</p>
          </div>
          {subscription ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Intervalo</p>
                <p className="text-sm">{INTERVAL_LABEL[subscription.interval]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="text-sm font-medium">{formatBRL(subscription.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Próxima cobrança</p>
                <p className="text-sm">{formatDate(subscription.next_billing_date ?? '')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Início</p>
                <p className="text-sm">{formatDate(subscription.starts_at ?? '')}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status assinatura</p>
                <p className="text-sm">{subscription.billing_status}</p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">Assinatura</p>
              <p className="text-sm text-muted-foreground">Sem assinatura ativa</p>
            </div>
          )}
        </div>

        {/* Aviso: cliente excluído do provider */}
        {needsReprovision && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-700/50 dark:bg-amber-950/30">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 space-y-1.5">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Cliente não encontrado no provider — provavelmente foi excluído do Asaas. Re-provisione para criar um novo registro antes de criar assinatura.
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onReprovision}>
                <RotateCcw className="mr-1.5 h-3 w-3" />
                Re-provisionar
              </Button>
            </div>
          </div>
        )}

        {/* Ações contratuais */}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {canCreateSubscription && (
            <Button size="sm" onClick={onCreateSubscription}>
              <CalendarCheck className="mr-2 h-3.5 w-3.5" />
              Criar assinatura
            </Button>
          )}
          {canChangePlan && (
            <Button size="sm" variant="outline" onClick={onChangePlan}>
              <CalendarCheck className="mr-2 h-3.5 w-3.5" />
              Trocar plano
            </Button>
          )}
          {canCancelSubscription && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={isCancellingSubscription}
              onClick={() => setConfirmCancelOpen(true)}
            >
              <XCircle className="mr-2 h-3.5 w-3.5" />
              Cancelar assinatura
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={isUpdatingMode}
            onClick={() => { setPendingMode(commercialMode); setShowModeSelector((v) => !v); }}
          >
            Mudar modo
          </Button>
        </div>

        {/* Seletor inline de modo */}
        {showModeSelector && (
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-secondary/20 p-3">
            <select
              value={pendingMode}
              onChange={(e) => setPendingMode(e.target.value as CommercialMode)}
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {allowedModes.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <Button size="sm" onClick={handleRequestModeChange} disabled={isUpdatingMode}>
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowModeSelector(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </Card>

      {/* AlertDialog — mudança de modo */}
      <AlertDialog open={confirmModeOpen} onOpenChange={setConfirmModeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar modo comercial</AlertDialogTitle>
            <AlertDialogDescription>
              Alterar de <strong>{COMMERCIAL_MODE_LABEL[commercialMode]}</strong> para{' '}
              <strong>{COMMERCIAL_MODE_LABEL[pendingMode]}</strong>?
              {isRecorrente && pendingMode !== 'manual' && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Esta ação afeta o fluxo de cobrança. Confirme antes de prosseguir.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowModeSelector(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onUpdateMode(pendingMode);
                setShowModeSelector(false);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog — cancelar assinatura */}
      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação encerrará a assinatura ativa. O cliente perderá o acesso recorrente e
              o lifecycle_status será marcado como cancelado. Esta operação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onCancelSubscription}
            >
              Cancelar assinatura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
