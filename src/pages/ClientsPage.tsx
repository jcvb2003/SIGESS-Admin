import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ClientCard } from "@/components/clients/ClientCard";
import { AddClientModal, ClientFormData } from "@/components/clients/AddClientModal";
import { Client } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from("entidades")
        .select("*")
        .order("data_cadastro", { ascending: false });

      if (error) throw error;
      setClients(data || []);
    } catch (error: any) {
      toast.error("Erro ao carregar clientes: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleAddClient = async (formData: ClientFormData) => {
    try {
      const { error } = await supabase.from("entidades").insert({
        nome_entidade: formData.nome_entidade,
        email: formData.email || null,
        telefone: formData.telefone,
        supabase_url: formData.supabase_url,
        supabase_publishable_key: formData.supabase_publishable_key,
        supabase_secret_keys: formData.supabase_secret_keys,
        logo_url: formData.logo_url || null,
        assinatura: formData.assinatura,
      });

      if (error) throw error;

      toast.success("Cliente adicionado com sucesso!");
      fetchClients();
    } catch (error: any) {
      toast.error("Erro ao adicionar cliente: " + error.message);
      throw error;
    }
  };

  const handleDeleteClient = async (client: Client) => {
    try {
      const { error } = await supabase
        .from("entidades")
        .delete()
        .eq("id", client.id);

      if (error) throw error;

      setClients((prev) => prev.filter((c) => c.id !== client.id));
      toast.success(`${client.nome_entidade} foi excluído`);
    } catch (error: any) {
      toast.error("Erro ao excluir cliente: " + error.message);
    }
  };

  const handleClientClick = (client: Client) => {
    navigate(`/clients/${client.id}`);
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Clientes</h1>
            <p className="mt-1 text-muted-foreground">
              Gerencie todos os projetos Supabase dos seus clientes
            </p>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2">
          <StatsCard
            title="Total de Clientes"
            value={clients.length}
            subtitle={`${clients.filter(c => c.assinatura === 'anual').length} anuais`}
            icon={Users}
          />
          <StatsCard
            title="Planos Mensais"
            value={clients.filter(c => c.assinatura === 'mensal').length}
            subtitle="clientes com plano mensal"
            icon={Users}
          />
        </div>

        {/* Client Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onDelete={handleDeleteClient}
              onClick={handleClientClick}
            />
          ))}
        </div>

        {clients.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">
              Nenhum cliente cadastrado
            </p>
            <p className="mt-1 text-muted-foreground">
              Adicione seu primeiro cliente para começar
            </p>
            <Button className="mt-4" onClick={() => setIsModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Cliente
            </Button>
          </div>
        )}

        <AddClientModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onAdd={handleAddClient}
        />
      </div>
    </MainLayout>
  );
}