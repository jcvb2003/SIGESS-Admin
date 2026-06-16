import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BillingCharge, BillingChargeStatus } from '../types';
import { CHARGE_STATUS_LABEL, CHARGE_TYPE_LABEL } from '../types';

function statusClass(status: BillingChargeStatus): string {
  switch (status) {
    case 'paid':      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
    case 'overdue':   return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    case 'pending':   return 'bg-secondary text-muted-foreground';
    default:          return 'bg-destructive/10 text-destructive';
  }
}

function formatBRL(reais: number): string {
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface ChargesTableProps {
  charges: BillingCharge[];
}

export function ChargesTable({ charges }: Readonly<ChargesTableProps>) {
  if (charges.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma cobrança registrada.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/30">
            <TableHead className="text-xs">Vencimento</TableHead>
            <TableHead className="text-xs">Descrição</TableHead>
            <TableHead className="text-right text-xs">Valor</TableHead>
            <TableHead className="text-xs">Tipo</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges.map((c) => (
            <TableRow key={c.id} className={c.status === 'cancelled' || c.status === 'failed' ? 'opacity-40' : ''}>
              <TableCell className="text-sm">
                {format(new Date(c.due_date), 'dd/MM/yyyy', { locale: ptBR })}
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-sm">{c.description ?? '—'}</TableCell>
              <TableCell className="text-right text-sm">{formatBRL(c.amount)}</TableCell>
              <TableCell className="text-sm">{CHARGE_TYPE_LABEL[c.type]}</TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(c.status)}`}
                >
                  {CHARGE_STATUS_LABEL[c.status]}
                </span>
              </TableCell>
              <TableCell>
                {c.payment_url ? (
                  <a
                    href={c.payment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Abrir <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
