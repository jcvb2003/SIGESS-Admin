import { useState } from 'react';
import { Copy, Loader2, Key, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useBillingActions } from '../hooks';
import type { BillingCharge } from '../types';

interface GenerateTokenButtonProps {
  adminClientId: string;
  charges: BillingCharge[];
}

interface TokenResult {
  token: string;
  expires_at: string;
}

const PAYABLE = new Set<BillingCharge['status']>(['pending', 'overdue']);

export function GenerateTokenButton({ adminClientId, charges }: Readonly<GenerateTokenButtonProps>) {
  const [result, setResult] = useState<TokenResult | null>(null);
  const { generateToken } = useBillingActions(adminClientId);

  // Seleciona a cobrança pagável mais recente (maior due_date)
  const openCharge = charges
    .filter((c) => PAYABLE.has(c.status))
    .sort((a, b) => b.due_date.localeCompare(a.due_date))[0] ?? null;

  const handleGenerate = () => {
    if (!openCharge) return;
    generateToken.mutate(openCharge.id, {
      onSuccess: (data) => {
        const d = data as TokenResult;
        setResult(d);
      },
    });
  };

  const webBaseUrl = import.meta.env.VITE_WEB_BASE_URL as string | undefined;
  const portalUrl = result && webBaseUrl
    ? `${webBaseUrl}/pay/${result.token}`
    : null;

  const handleCopy = () => {
    if (!webBaseUrl) {
      toast.error('VITE_WEB_BASE_URL não configurado — link indisponível');
      return;
    }
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl).then(() => {
      toast.success('Link copiado para a área de transferência');
    });
  };

  if (result) {
    return (
      <div className="rounded-md border border-border/60 bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Token de portal gerado</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setResult(null)}
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        {portalUrl ? (
          <code className="block break-all rounded bg-background px-2 py-1.5 text-xs font-mono">
            {portalUrl}
          </code>
        ) : (
          <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            VITE_WEB_BASE_URL não configurado
          </p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            Expira em {format(new Date(result.expires_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCopy}>
            <Copy className="mr-1.5 h-3 w-3" />
            Copiar link
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleGenerate}
        disabled={generateToken.isPending || !openCharge}
        title={!openCharge ? 'Nenhuma cobrança aberta para vincular ao token' : undefined}
      >
        {generateToken.isPending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Key className="mr-2 h-3.5 w-3.5" />
        )}
        Gerar token portal
      </Button>
      {!openCharge && (
        <span className="text-[11px] text-muted-foreground">
          Sem cobrança aberta — crie uma cobrança primeiro
        </span>
      )}
    </div>
  );
}
