import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { BillingAccountSummary } from '../services/billing.service';
import { COMMERCIAL_MODE_LABEL, LIFECYCLE_LABEL } from '../types';
import type { BillingAccountLifecycleStatus, CommercialMode } from '../types';

function lifecycleBadgeClass(status: BillingAccountLifecycleStatus): string {
  switch (status) {
    case 'active':          return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
    case 'trial_active':    return 'bg-sky-500/10 text-sky-700 dark:text-sky-400';
    case 'past_due':        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    case 'suspended':       return 'bg-destructive/10 text-destructive';
    case 'payment_pending': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    default:                return 'bg-secondary text-muted-foreground';
  }
}

interface ClientsBillingTableProps {
  accounts: BillingAccountSummary[];
  projectIdByClientId: Record<string, string>;
}

export function ClientsBillingTable({ accounts, projectIdByClientId }: Readonly<ClientsBillingTableProps>) {
  const navigate = useNavigate();

  if (accounts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma conta de billing registrada.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/30">
            <TableHead className="text-xs">Cliente</TableHead>
            <TableHead className="text-xs">Modo</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Provider</TableHead>
            <TableHead className="text-xs">Bloqueio</TableHead>
            <TableHead className="text-xs" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => {
            const projectId = projectIdByClientId[a.admin_client_id];
            return (
              <TableRow key={a.id}>
                <TableCell className="text-sm font-medium">{a.nome_entidade}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {COMMERCIAL_MODE_LABEL[a.commercial_mode as CommercialMode] ?? a.commercial_mode}
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${lifecycleBadgeClass(a.lifecycle_status)}`}>
                    {LIFECYCLE_LABEL[a.lifecycle_status]}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.provider}</TableCell>
                <TableCell>
                  {a.is_billing_blocked ? (
                    <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                      {a.billing_blocked_reason === 'billing_delinquent' ? 'Inadimplente' : 'Suspenso'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {projectId ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => navigate(`/clients/${projectId}/clientes/${a.admin_client_id}/billing`)}
                    >
                      Detalhe
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
