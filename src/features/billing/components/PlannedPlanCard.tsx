import { CalendarX } from 'lucide-react';
import { formatDate } from '@/shared/utils/date';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { BillingAccount, BillingPlan } from '../types';

interface PlannedPlanCardProps {
  account: BillingAccount;
  plans: BillingPlan[];
  onClearSchedule: () => void;
  isClearing: boolean;
}

export function PlannedPlanCard({ account, plans, onClearSchedule, isClearing }: Readonly<PlannedPlanCardProps>) {
  const nextPlan = plans.find((p) => p.id === account.next_plan_id);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Plano agendado</p>
          <p className="text-sm font-medium">{nextPlan?.name ?? account.next_plan_id}</p>
          {account.next_plan_effective_date && (
            <p className="text-xs text-muted-foreground">
              Vigência a partir de {formatDate(account.next_plan_effective_date)}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
          onClick={onClearSchedule}
          disabled={isClearing}
        >
          <CalendarX className="mr-2 h-3.5 w-3.5" />
          Cancelar agendamento
        </Button>
      </div>
    </Card>
  );
}
