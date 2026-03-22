import { useState, useEffect, useCallback } from "react";
import { Activity, ShieldCheck, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { proxyAction } from "@/services/clients.service";

interface HealthStatus {
  status: "online" | "offline" | "checking" | "error";
  latency?: number;
  message?: string;
}

interface HealthCheckCardProps {
  readonly clientId: string;
}

export function HealthCheckCard({ clientId }: HealthCheckCardProps) {
  const [health, setHealth] = useState<HealthStatus>({ status: "checking" });

  const checkHealth = useCallback(async () => {
    if (!clientId) return;
    
    setHealth({ status: "checking" });
    try {
      // Use Proxy Edge Function instead of direct OPTIONS fetch
      const result = await proxyAction(clientId, "health-check");
      
      if (result.status === "online") {
        setHealth({ status: "online", latency: result.latency });
      } else {
        setHealth({ status: "offline", message: result.error || "Serviço indesejado" });
      }
    } catch (err: any) {
      setHealth({ status: "error", message: err.message || "Falha no proxy" });
    }
  }, [clientId]);

  useEffect(() => {
    void checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [checkHealth]);

  const getStatusConfig = () => {
    switch (health.status) {
      case "online":
        return {
          icon: <ShieldCheck className="h-5 w-5 text-emerald-500" />,
          bgColor: "bg-emerald-500/10",
          textColor: "text-emerald-500",
          label: "Operacional",
          sub: health.latency ? `${health.latency}ms` : "Conectado"
        };
      case "offline":
        return {
          icon: <ShieldAlert className="h-5 w-5 text-destructive" />,
          bgColor: "bg-destructive/10",
          textColor: "text-destructive",
          label: "Offline",
          sub: "Verifique as chaves"
        };
      case "error":
        return {
          icon: <WifiOff className="h-5 w-5 text-amber-500" />,
          bgColor: "bg-amber-500/10",
          textColor: "text-amber-500",
          label: "Erro de Proxy",
          sub: "Falha na conexão"
        };
      default:
        return {
          icon: <Wifi className="h-5 w-5 animate-pulse text-primary" />,
          bgColor: "bg-primary/10",
          textColor: "text-primary",
          label: "Verificando...",
          sub: "Aguarde"
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Card className="p-4 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${config.bgColor} blur-2xl group-hover:blur-3xl transition-all opacity-50`} />
      
      <div className="flex items-center gap-3 relative z-10">
        <div className={`rounded-xl ${config.bgColor} p-2.5 transition-transform group-hover:scale-110 duration-300`}>
          {config.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Status API</p>
            <Badge variant="outline" className={`text-[10px] font-bold ${config.textColor} border-current/20`}>
              {config.label}
            </Badge>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <p className="text-xl font-bold text-foreground">
              {health.status === "online" ? "Supabase" : "Indisponível"}
            </p>
            <span className="text-[11px] font-medium text-muted-foreground">{config.sub}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
