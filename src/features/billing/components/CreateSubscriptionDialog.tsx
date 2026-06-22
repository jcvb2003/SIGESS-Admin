import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBillingActions, useBillingPlans } from '../hooks';
import type { BillingInterval, BillingPlan, BillingSubscription } from '../types';

interface CreateSubscriptionDialogProps {
  adminClientId: string;
  mode?: 'create' | 'change';
  subscription?: BillingSubscription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function planLabel(plan: BillingPlan, interval: BillingInterval): string {
  const limite = plan.max_socios_to ? `até ${plan.max_socios_to} sócios` : 'ilimitado';
  const price = interval === 'annual' ? plan.price_annual : plan.price_monthly;
  return `${plan.name} · ${limite} · R$ ${price.toFixed(2).replace('.', ',')}`;
}

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function CreateSubscriptionDialog({
  adminClientId,
  mode = 'create',
  subscription = null,
  open,
  onOpenChange,
}: Readonly<CreateSubscriptionDialogProps>) {
  const { createSubscription, changeSubscriptionPlan } = useBillingActions(adminClientId);
  const { data: plans = [] } = useBillingPlans();

  const [planId, setPlanId] = useState('');
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [amount, setAmount] = useState('');
  const [nextDueDate, setNextDueDate] = useState(todayPlusDays(1));

  const plan = plans.find((p) => p.id === planId);

  useEffect(() => {
    if (!open) return;
    if (mode !== 'change' || !subscription) return;

    setPlanId(subscription.plan_id);
    setInterval(subscription.interval);
    setAmount(subscription.amount.toFixed(2));
    setNextDueDate(subscription.next_billing_date ?? todayPlusDays(1));
  }, [open, mode, subscription]);

  useEffect(() => {
    if (!plan) return;
    const price = interval === 'annual' ? plan.price_annual : plan.price_monthly;
    setAmount(price.toFixed(2));
  }, [plan, interval]);

  const reset = () => {
    setPlanId('');
    setInterval('monthly');
    setAmount('');
    setNextDueDate(todayPlusDays(1));
  };

  const hasChanges = mode !== 'change' || !subscription || (
    planId !== subscription.plan_id ||
    interval !== subscription.interval ||
    parseFloat(amount) !== subscription.amount ||
    nextDueDate !== (subscription.next_billing_date ?? '')
  );

  const canSubmit = planId && amount && nextDueDate && hasChanges;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) return;
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast.error('Valor deve ser maior que zero');
      return;
    }

    const payload = {
      plan_id: planId,
      interval,
      amount: amountNum,
      next_due_date: nextDueDate,
      description: plan ? planLabel(plan, interval) : undefined,
    };

    const mutation = mode === 'change' ? changeSubscriptionPlan : createSubscription;
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(mode === 'change' ? 'Plano atualizado' : 'Assinatura criada');
        reset();
        onOpenChange(false);
      },
    });
  };

  const isPending = createSubscription.isPending || changeSubscriptionPlan.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'change' ? 'Trocar plano' : 'Criar assinatura'}</DialogTitle>
          <DialogDescription>
            {mode === 'change'
              ? 'Atualiza o plano e a configuração da assinatura recorrente no provedor.'
              : 'Ativa a cobrança recorrente no provedor para este cliente.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Periodicidade <span className="text-destructive">*</span></Label>
            <Select value={interval} onValueChange={(v) => setInterval(v as BillingInterval)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Plano <span className="text-destructive">*</span></Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {planLabel(p, interval)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cs-amount">Valor (R$) <span className="text-destructive">*</span></Label>
              <Input
                id="cs-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="99.90"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cs-due">
                {mode === 'change' ? 'Próximo vencimento' : 'Primeiro vencimento'} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cs-due"
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit || isPending}>
              {mode === 'change'
                ? (changeSubscriptionPlan.isPending ? 'Atualizando...' : 'Trocar plano')
                : (createSubscription.isPending ? 'Criando...' : 'Criar assinatura')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
