import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, HardDrive, Activity, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { MiniCalendar } from "@/components/dashboard/MiniCalendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Client } from "@/types";
import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("entidades")
        .select("*")
        .order("data_cadastro", { ascending: false })
        .limit(5);

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
    } finally {
      setLoading(false);
    }
  };

  const activeClients = clients.length;
  const annualClients = clients.filter((c) => c.assinatura === "anual").length;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Olá, {user?.email?.split("@")[0] || "Admin"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Visão geral do seu painel administrativo
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total de Clientes"
            value={clients.length}
            subtitle={`${annualClients} anuais`}
            icon={Users}
          />
          <StatsCard
            title="Clientes Ativos"
            value={activeClients}
            subtitle="todos os planos"
            icon={Activity}
          />
          <StatsCard
            title="Planos Mensais"
            value={clients.filter((c) => c.assinatura === "mensal").length}
            subtitle="renovação mensal"
            icon={HardDrive}
          />
          <StatsCard
            title="Planos Anuais"
            value={annualClients}
            subtitle="renovação anual"
            icon={Activity}
          />
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Recent Clients */}
          <Card className="col-span-2 p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Clientes Recentes
            </h2>
            {clients.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum cliente cadastrado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    onClick={() => navigate(`/clients/${client.id}`)}
                    className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-secondary/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      {client.logo_url ? (
                        <img
                          src={client.logo_url}
                          alt={client.nome_entidade}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                          <span className="text-sm font-bold text-primary">
                            {client.nome_entidade.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-foreground">
                          {client.nome_entidade}
                        </p>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                          {client.supabase_url}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="default"
                      className="bg-primary/20 text-primary border-primary/30"
                    >
                      {client.assinatura === "anual" ? "Anual" : "Mensal"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Calendar */}
          <div className="space-y-6">
            <MiniCalendar />

            {/* Quick Actions */}
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Ações Rápidas
              </h3>
              <div className="space-y-2">
                <button
                  onClick={() => navigate("/clients")}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-sm transition-colors hover:bg-secondary"
                >
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-foreground">Gerenciar Clientes</span>
                </button>
                <button
                  onClick={() => navigate("/global")}
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-sm transition-colors hover:bg-secondary"
                >
                  <HardDrive className="h-4 w-4 text-primary" />
                  <span className="text-foreground">Modelos de Documentos</span>
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}