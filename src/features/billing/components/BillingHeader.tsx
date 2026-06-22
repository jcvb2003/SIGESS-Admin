import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface BillingHeaderProps {
  nomeEntidade: string;
  projectId: string;
  clienteId: string;
  onSync: () => void;
  isSyncing: boolean;
}

export function BillingHeader({ nomeEntidade, projectId, clienteId, onSync, isSyncing }: Readonly<BillingHeaderProps>) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 -ml-2"
          onClick={() => navigate(`/clients/${projectId}/clientes/${clienteId}`)}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Voltar
        </Button>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Billing</p>
          <h1 className="truncate text-lg font-semibold leading-tight">{nomeEntidade}</h1>
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing}>
        {isSyncing ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
        )}
        Sincronizar
      </Button>
    </div>
  );
}
