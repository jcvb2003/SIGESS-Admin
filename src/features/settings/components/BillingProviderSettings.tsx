import { useState } from "react";
import { formatDateTime } from "@/shared/utils/date";
import { Settings2, Loader2, CheckCircle2, Circle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useBillingProviderSettings,
  useUpsertBillingProviderSettings,
  type UpsertProviderSettingsInput,
} from "../hooks/useBillingProviderSettings";

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <CheckCircle2 className="h-3.5 w-3.5" />
      configurado
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Circle className="h-3.5 w-3.5" />
      não configurado
    </span>
  );
}

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/billing-webhook`;

export function BillingProviderSettings() {
  const { data: meta, isLoading } = useBillingProviderSettings();
  const upsert = useUpsertBillingProviderSettings();

  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [provider, setProvider] = useState<string>("");
  const [sandbox, setSandbox] = useState<boolean>(true);
  const [apiKey, setApiKey] = useState("");
  const [webhookToken, setWebhookToken] = useState("");
  const [editing, setEditing] = useState(false);

  const handleEdit = () => {
    setProvider(meta?.provider ?? "stub");
    setSandbox(meta?.sandbox ?? true);
    setApiKey("");
    setWebhookToken("");
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const input: UpsertProviderSettingsInput = {
      provider,
      sandbox,
    };
    // Only include secrets if the user actually typed something
    if (apiKey.trim()) input.api_key = apiKey.trim();
    if (webhookToken.trim()) input.webhook_token = webhookToken.trim();

    try {
      await upsert.mutateAsync(input);
      toast.success("Configuração de provider salva");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar configuração");
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Provider de Cobrança</h2>
            <p className="text-sm text-muted-foreground">
              Configuração do gateway de pagamentos
            </p>
          </div>
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={handleEdit} disabled={isLoading}>
            Editar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !editing ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Provider</span>
            <span className="font-medium uppercase">{meta?.provider ?? "stub"}</span>
          </div>
          {meta?.provider === "asaas" && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Modo</span>
              <span>{meta.sandbox ? "Sandbox" : "Produção"}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API Key</span>
            <ConfiguredBadge configured={meta?.api_key_configured ?? false} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Webhook Token</span>
            <ConfiguredBadge configured={meta?.webhook_token_configured ?? false} />
          </div>
          {meta?.provider === "asaas" && (
            <div className="space-y-1.5 pt-1">
              <span className="text-muted-foreground text-sm">URL do Webhook</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-secondary/60 px-3 py-1.5 text-xs font-mono text-foreground border border-border/50 select-all truncate">
                  {WEBHOOK_URL}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  title="Copiar URL"
                  onClick={() => {
                    navigator.clipboard.writeText(WEBHOOK_URL);
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 2000);
                  }}
                >
                  {copiedWebhook
                    ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                    : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-muted-foreground">Fonte</span>
            <Badge variant={meta?.source === "db" ? "default" : "secondary"} className="text-xs">
              {meta?.source === "db" ? "banco de dados" : "variável de ambiente"}
            </Badge>
          </div>
          {meta?.updated_at && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Última atualização</span>
              <span>
                {formatDateTime(meta.updated_at)}
                {meta.updated_by ? ` por ${meta.updated_by}` : ""}
              </span>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider-select">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger id="provider-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stub">Stub (testes)</SelectItem>
                <SelectItem value="asaas">Asaas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {provider === "asaas" && (
            <>
              <div className="flex items-center gap-3">
                <Switch
                  id="sandbox-switch"
                  checked={sandbox}
                  onCheckedChange={setSandbox}
                />
                <Label htmlFor="sandbox-switch">
                  Sandbox {sandbox ? "(ativo)" : "(produção)"}
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key-input">
                  API Key
                  <span className="ml-2">
                    <ConfiguredBadge configured={meta?.api_key_configured ?? false} />
                  </span>
                </Label>
                <Input
                  id="api-key-input"
                  type="password"
                  placeholder="Deixe vazio para manter a chave atual"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Preencha apenas para substituir. Campo vazio não altera o valor salvo.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook-token-input">
                  Webhook Token
                  <span className="ml-2">
                    <ConfiguredBadge configured={meta?.webhook_token_configured ?? false} />
                  </span>
                </Label>
                <Input
                  id="webhook-token-input"
                  type="password"
                  placeholder="Deixe vazio para manter o token atual"
                  value={webhookToken}
                  onChange={(e) => setWebhookToken(e.target.value)}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Preencha apenas para substituir. Campo vazio não altera o valor salvo.
                </p>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={upsert.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
