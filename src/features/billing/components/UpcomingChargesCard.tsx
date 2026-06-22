import { formatDate } from '@/shared/utils/date';
import { Card } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { UpcomingCharge } from '../services/billing.service';
import { CHARGE_TYPE_LABEL } from '../types';
import type { BillingChargeType } from '../types';

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusBadge(status: string) {
  if (status === 'overdue') return 'bg-destructive/10 text-destructive';
  return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
}

interface UpcomingChargesCardProps {
  charges: UpcomingCharge[];
}

export function UpcomingChargesCard({ charges }: Readonly<UpcomingChargesCardProps>) {
  return (
    <Card className="p-5 space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Cobranças abertas ({charges.length})
      </p>
      {charges.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma cobrança pendente.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/40">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30">
                <TableHead className="text-xs">Vencimento</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-right text-xs">Valor</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {charges.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{formatDate(c.due_date)}</TableCell>
                  <TableCell className="text-sm font-medium">{c.nome_entidade}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {CHARGE_TYPE_LABEL[c.type as BillingChargeType] ?? c.type}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatBRL(c.amount)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge(c.status)}`}>
                      {c.status === 'overdue' ? 'Vencida' : 'Pendente'}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
