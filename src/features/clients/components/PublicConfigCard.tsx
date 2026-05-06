import { useState } from "react";
import { AlertTriangle, Check, Copy, Globe, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Client } from "../types";

interface PublicConfigCardProps {
  readonly client: Client;
}

type ConfigStatus = "ok" | "missing_key" | "missing_code" | "incomplete";

function getConfigStatus(client: Client): ConfigStatus {
  if (!client.tenant_code) return "missing_code";
  if (!client.supabase_publishable_key) return "missing_key";
  if (!client.supabase_url) return "incomplete";
  return "ok";
}

const STATUS_CONFIG = {
  ok: {
    icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />,
    bgColor: "bg-emerald-500/10",
    badge: "Resolvivel",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    description: "Este tenant esta apto para resolucao publica dinamica.",
  },
  missing_key: {
    icon: <ShieldAlert className="h-5 w-5 text-amber-500" />,
    bgColor: "bg-amber-500/10",
    badge: "Anon key ausente",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    description: "supabase_publishable_key nao configurada. O tenant nao pode ser resolvido dinamicamente.",
  },
  missing_code: {
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    bgColor: "bg-amber-500/10",
    badge: "Codigo ausente",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    description: "tenant_code nao configurado. O tenant nao pode ser encontrado pelo resolver dinamico.",
  },
  incomplete: {
    icon: <ShieldAlert className="h-5 w-5 text-destructive" />,
    bgColor: "bg-destructive/10",
    badge: "Incompleto",
    badgeClass: "border-destructive/30 bg-destructive/5 text-destructive",
    description: "A configuracao publica deste tenant esta incompleta.",
  },
} as const;

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-4 items-center gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="col-span-2 rounded bg-secondary/30 px-2 py-1 font-mono text-xs break-all">
        {value ?? <span className="not-italic text-muted-foreground/50">Nao definido</span>}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 justify-self-end"
        onClick={() => void handleCopy()}
        disabled={!value}
        title="Copiar"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

export function PublicConfigCard({ client }: PublicConfigCardProps) {
  const status = getConfigStatus(client);
  const config = STATUS_CONFIG[status];

  return (
    <Card className="relative overflow-hidden p-6">
      <div className={`absolute right-0 top-0 h-24 w-24 -translate-y-6 translate-x-6 rounded-full ${config.bgColor} blur-2xl opacity-50`} />

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Globe className="h-5 w-5 text-primary" />
            Configuracao Publica
          </h3>
          <Badge variant="outline" className={config.badgeClass}>
            {config.badge}
          </Badge>
        </div>

        <div className="rounded-lg border border-border/40 bg-background/70 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm">
            {config.icon}
            <span className="font-medium">{config.description}</span>
          </div>

          <div className="space-y-2">
            <CopyField label="Tenant Code" value={client.tenant_code} />
            <CopyField label="URL" value={client.supabase_url} />
            <CopyField label="Anon Key" value={client.supabase_publishable_key} />
          </div>
        </div>
      </div>
    </Card>
  );
}
