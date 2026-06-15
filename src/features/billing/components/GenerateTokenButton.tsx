import { useState } from 'react';
import { Copy, Loader2, Key, X } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useBillingActions } from '../hooks';

interface GenerateTokenButtonProps {
  adminClientId: string;
}

interface TokenResult {
  token: string;
  expires_at: string;
}

export function GenerateTokenButton({ adminClientId }: Readonly<GenerateTokenButtonProps>) {
  const [result, setResult] = useState<TokenResult | null>(null);
  const { generateToken } = useBillingActions(adminClientId);

  const handleGenerate = () => {
    generateToken.mutate(undefined, {
      onSuccess: (data) => {
        const d = data as TokenResult;
        setResult(d);
      },
    });
  };

  const portalUrl = result
    ? `${import.meta.env.VITE_WEB_BASE_URL}/pay/${result.token}`
    : null;

  const handleCopy = () => {
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
        <code className="block break-all rounded bg-background px-2 py-1.5 text-xs font-mono">
          {portalUrl}
        </code>
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
    <Button
      variant="outline"
      size="sm"
      onClick={handleGenerate}
      disabled={generateToken.isPending}
    >
      {generateToken.isPending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Key className="mr-2 h-3.5 w-3.5" />
      )}
      Gerar token portal
    </Button>
  );
}
