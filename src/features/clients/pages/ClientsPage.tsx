import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/features/dashboard";
import { useClients, useDeleteClient, ClientCard, AddClientModal } from "@/features/clients";

export default function ClientsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  
  const { data: clients = [], isLoading } = useClients();
  const deleteClientMutation = useDeleteClient();

  const handleClientClick = (client: any) => {
    navigate(`/clients/${client.id}`);
  };

  const handleDeleteClient = async (client: any) => {
    if (confirm(`Tem certeza que deseja excluir ${client.nome_entidade}?`)) {
      await deleteClientMutation.mutateAsync(client.id);
    }
  };

  if (isLoading) {
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
              onDelete={() => handleDeleteClient(client)}
              onClick={() => handleClientClick(client)}
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
        />
      </div>
    </MainLayout>
  );
}
