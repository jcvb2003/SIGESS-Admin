import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertCircle, Loader2 } from 'lucide-react';
import { getBillingEvents } from '@/features/billing/services/billing.service';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

function statusBadge(status: string) {
  switch (status) {
    case 'processed': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
    case 'failed':    return 'bg-destructive/10 text-destructive';
    default:          return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'processed': return 'Processado';
    case 'failed':    return 'Falhou';
    default:          return 'Pendente';
  }
}

function formatTs(iso: string) {
  return format(new Date(iso), "dd/MM/yy HH:mm:ss", { locale: ptBR });
}

export function BillingEventsTable() {
  const { data: events = [], isLoading, isError, error } = useQuery({
    queryKey: ['billing', 'events'],
    queryFn: () => getBillingEvents(50),
    refetchInterval: 30_000,
  });

  if (isError) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          Falha ao carregar eventos:{' '}
          {error instanceof Error ? error.message : 'Erro desconhecido'}.
          {' '}"Sem eventos" e "falha na leitura" são coisas diferentes.
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento de webhook registrado.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/30">
            <TableHead className="text-xs">Data</TableHead>
            <TableHead className="text-xs">Provider</TableHead>
            <TableHead className="text-xs">Tipo de evento</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Erro</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((ev) => (
            <TableRow key={ev.id} className={ev.status === 'failed' ? 'bg-destructive/5' : ''}>
              <TableCell className="text-xs font-mono text-muted-foreground">
                {formatTs(ev.created_at)}
              </TableCell>
              <TableCell className="text-xs font-mono">{ev.provider}</TableCell>
              <TableCell className="text-sm">{ev.event_type}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadge(ev.status)}`}>
                  {statusLabel(ev.status)}
                </span>
              </TableCell>
              <TableCell className="max-w-[300px] truncate text-xs text-destructive">
                {ev.error ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
