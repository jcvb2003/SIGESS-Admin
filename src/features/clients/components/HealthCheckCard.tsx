import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ShieldAlert, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkHealth = useCallback(async () => {
    if (!clientId) return;
    
    setHealth(prev => ({ ...prev, status: "checking" }));
    try {
      const result = await proxyAction(clientId, "health-check");
      
      if (result.status === "online") {
        setHealth({ status: "online", latency: result.latency });
      } else {
        setHealth({ status: "offline", message: result.error || "Serviço indisponível" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Falha no proxy";
      setHealth({ status: "error", message });
    }
  }, [clientId]);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await checkHealth();
    setTimeout(() => setIsRefreshing(false), 3000);
  };

  useEffect(() => {
    void checkHealth();
    const interval = setInterval(checkHealth, 30000);
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
                  onClick={handleManualRefresh}
                  disabled={isRefreshing || health.status === "checking"}
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
                {health.status === "online" ? "Supabase" : "Indisponível"}
              </p>
              <span className="text-[11px] font-medium text-muted-foreground">{config.sub}</span>
            </div>
          </div>
        </div>

        {(health.status === 'offline' || health.status === 'error') && health.message && (
          <p className="text-[10px] text-destructive/80 mt-2 truncate font-medium border-t border-destructive/10 pt-2" title={health.message}>
            {health.message}
          </p>
        )}
      </div>
    </Card>
  );
}
