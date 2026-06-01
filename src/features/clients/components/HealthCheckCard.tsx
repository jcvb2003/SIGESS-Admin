import { useState, useCallback } from "react";
import { ShieldCheck, ShieldAlert, Wifi, WifiOff, RefreshCw, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { proxyAction } from "@/services/clients.service";
import type { Project } from "@/features/clients/types";

type KeyStatus = "ok" | "invalid" | "unknown";

interface KeyStatuses {
  anon: KeyStatus;
  service_role: KeyStatus;
  pat: KeyStatus;
}

interface HealthState {
  status: "online" | "offline" | "checking" | "error" | "cached";
  latency?: number;
  message?: string;
  keys?: KeyStatuses;
  checkedAt?: string | null;
}

interface HealthCheckCardProps {
  project: Project;
}

const KEY_LABELS: Record<string, string> = {
  anon:         "anon",
  service_role: "service_role",
  pat:          "PAT",
};

const KEY_STATUS_CLASS: Record<KeyStatus, string> = {
  ok:      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  invalid: "bg-destructive/10 text-destructive",
  unknown: "bg-secondary/60 text-muted-foreground",
};

const KEY_DOT_CLASS: Record<KeyStatus, string> = {
  ok:      "bg-emerald-500",
  invalid: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

function initialStateFromProject(project: Project): HealthState {
  if (project.key_status === "valid")
    return { status: "cached", checkedAt: project.last_health_check_at };
  if (project.key_status === "broken")
    return {
      status: "offline",
      message: project.health_error_detail ?? "Chave inválida",
      checkedAt: project.last_health_check_at,
    };
  return { status: "cached", checkedAt: project.last_health_check_at };
}

function formatCheckedAt(iso: string | null | undefined): string {
  if (!iso) return "Nunca verificado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

export function HealthCheckCard({ project }: HealthCheckCardProps) {
  const [health, setHealth]         = useState<HealthState>(() => initialStateFromProject(project));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const runHealthCheck = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setHealth((prev) => ({ ...prev, status: "checking" }));
    try {
      const result = await proxyAction(project.id, "health-check");
      if (result.status === "online") {
        setHealth({
          status: "online",
          latency: result.latency,
          keys: result.keys ?? undefined,
          checkedAt: new Date().toISOString(),
        });
      } else {
        setHealth({
          status: "offline",
          message: result.error || "Serviço indisponível",
          checkedAt: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      setHealth({
        status: "error",
        message: err instanceof Error ? err.message : "Falha no proxy",
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [project.id, isRefreshing]);

  const getStatusConfig = () => {
    switch (health.status) {
      case "online":
        return {
          icon:      <ShieldCheck className="h-5 w-5 text-emerald-500" />,
          bgColor:   "bg-emerald-500/10",
          textColor: "text-emerald-500",
          label:     "Operacional",
          sub:       health.latency ? `${health.latency}ms` : "Conectado",
        };
      case "offline": {
        const isAuth =
          health.message?.toLowerCase().includes("autenticação") ||
          health.message?.toLowerCase().includes("acesso") ||
          health.message?.toLowerCase().includes("inválida");
        return {
          icon:      isAuth
            ? <ShieldAlert className="h-5 w-5 text-destructive" />
            : <WifiOff className="h-5 w-5 text-amber-500" />,
          bgColor:   isAuth ? "bg-destructive/10" : "bg-amber-500/10",
          textColor: isAuth ? "text-destructive" : "text-amber-500",
          label:     isAuth ? "Chave Inválida" : "Offline",
          sub:       isAuth ? "Falha na credencial" : "Verifique a rede",
        };
      }
      case "error":
        return {
          icon:      <WifiOff className="h-5 w-5 text-amber-500" />,
          bgColor:   "bg-amber-500/10",
          textColor: "text-amber-500",
          label:     "Erro de Proxy",
          sub:       "Falha na conexão",
        };
      case "checking":
        return {
          icon:      <Wifi className="h-5 w-5 animate-pulse text-primary" />,
          bgColor:   "bg-primary/10",
          textColor: "text-primary",
          label:     "Verificando...",
          sub:       "Aguarde",
        };
      default: // cached
        return {
          icon:      project.key_status === "valid"
            ? <ShieldCheck className="h-5 w-5 text-emerald-500" />
            : <HelpCircle className="h-5 w-5 text-muted-foreground" />,
          bgColor:   project.key_status === "valid" ? "bg-emerald-500/10" : "bg-muted/40",
          textColor: project.key_status === "valid" ? "text-emerald-500" : "text-muted-foreground",
          label:     project.key_status === "valid" ? "OK (cache)" : "Desconhecido",
          sub:       formatCheckedAt(health.checkedAt),
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Card className="p-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300 min-h-[110px]">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${config.bgColor} blur-2xl group-hover:blur-3xl transition-all opacity-50`} />

      <div className="flex flex-col h-full relative z-10">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl ${config.bgColor} p-2.5 transition-transform group-hover:scale-110 duration-300`}>
            {config.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Status API</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={runHealthCheck}
                  disabled={isRefreshing || health.status === "checking"}
                  title="Verificar agora"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshing || health.status === "checking" ? "animate-spin" : ""}`} />
                </Button>
                <Badge variant="outline" className={`text-[10px] font-bold ${config.textColor} border-current/20`}>
                  {config.label}
                </Badge>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-lg font-bold text-foreground">
                {health.status === "online" ? "Supabase" : health.status === "checking" ? "…" : "Status"}
              </p>
              <span className="text-[11px] font-medium text-muted-foreground">{config.sub}</span>
            </div>
          </div>
        </div>

        {(health.status === "offline" || health.status === "error") && health.message && (
          <p
            className="text-[10px] text-destructive/80 mt-2 truncate font-medium border-t border-destructive/10 pt-2"
            title={health.message}
          >
            {health.message}
          </p>
        )}

        <div className="mt-3 flex items-center gap-1.5 border-t border-border/40 pt-3">
          {(["anon", "service_role", "pat"] as const).map((key) => {
            const s = health.keys?.[key] ?? "unknown";
            return (
              <span
                key={key}
                title={KEY_LABELS[key]}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${KEY_STATUS_CLASS[s]}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${KEY_DOT_CLASS[s]}`} />
                {KEY_LABELS[key]}
              </span>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
