import { Card } from '@/components/ui/card';
import type { BillingAccountSummary } from '../services/billing.service';

interface KPIProps {
  label: string;
  value: number | string;
  sub?: string;
  highlight?: boolean;
}

function KPICard({ label, value, sub, highlight }: Readonly<KPIProps>) {
  return (
    <Card className="p-4 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface BillingKPICardsProps {
  accounts: BillingAccountSummary[];
  mrr: number;
}

export function BillingKPICards({ accounts, mrr }: Readonly<BillingKPICardsProps>) {
  const active    = accounts.filter((a) => a.lifecycle_status === 'active').length;
  const trial     = accounts.filter((a) => a.lifecycle_status === 'trial_active').length;
  const pastDue   = accounts.filter((a) => a.lifecycle_status === 'past_due').length;
  const draft     = accounts.filter((a) => a.lifecycle_status === 'draft').length;
  const blocked   = accounts.filter((a) => a.is_billing_blocked).length;
  const manual    = accounts.filter((a) => a.commercial_mode === 'manual').length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <KPICard label="MRR estimado" value={formatBRL(mrr)} sub="assinaturas ativas mensais" />
      <KPICard label="Ativos" value={active} />
      <KPICard label="Trial" value={trial} />
      <KPICard label="Inadimplentes" value={pastDue} highlight={pastDue > 0} />
      <KPICard label="Manual" value={manual} sub="sem assinatura Asaas" />
      <KPICard label="Bloqueados" value={blocked} highlight={blocked > 0} />
      {draft > 0 && <KPICard label="Rascunho" value={draft} sub="sem provisão" />}
    </div>
  );
}
