import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/features/dashboard";
import { useClients, useDeleteClient, ClientCard, AddTenantDialog, DeleteClientDialog, SubscriptionModal } from "@/features/clients";
import { type Client } from "@/features/clients/types";

export default function ClientsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  
  const { data: clients = [], isLoading } = useClients();
  const deleteClientMutation = useDeleteClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [clientForSubscription, setClientForSubscription] = useState<Client | null>(null);

  const handleClientClick = (client: Client) => {
    navigate(`/clients/${client.id}`);
  };

  const handleDeleteClick = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleSubscriptionClick = (client: Client) => {
    setClientForSubscription(client);
    setSubscriptionOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (clientToDelete) {
      await deleteClientMutation.mutateAsync(clientToDelete.id);
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
              onDelete={() => handleDeleteClick(client)}
              onSubscription={() => handleSubscriptionClick(client)}
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

        <AddTenantDialog
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
        />

        {clientToDelete && (
          <DeleteClientDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            clientName={clientToDelete.nome_entidade}
            onConfirm={handleConfirmDelete}
          />
        )}

        {clientForSubscription && (
          <SubscriptionModal
            client={clientForSubscription}
            open={subscriptionOpen}
            onOpenChange={setSubscriptionOpen}
          />
        )}
      </div>
    </MainLayout>
  );
}
