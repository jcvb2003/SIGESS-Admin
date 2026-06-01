import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Loader2, Search, AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import { isPast, differenceInDays } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClients, useDeleteClient, ClientCard, AddTenantDialog, DeleteClientDialog, SubscriptionModal } from "@/features/clients";
import type { ClienteComProjeto } from "@/features/clients/types";

function StatStrip({ clients }: { clients: ClienteComProjeto[] }) {
  const total = clients.length;

  const ativos = clients.filter((c) => {
    if (!c.acesso_expira_em) return true;
    return !isPast(new Date(c.acesso_expira_em));
  }).length;

  const expirando = clients.filter((c) => {
    if (!c.acesso_expira_em) return false;
    const days = differenceInDays(new Date(c.acesso_expira_em), new Date());
    return days >= 0 && days <= 30;
  }).length;

  const trial = clients.filter((c) => c.assinatura === "trial").length;

  const items = [
    { label: "Total", value: total, icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "Ativos", value: ativos, icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Expirando em 30d", value: expirando, icon: AlertTriangle, color: expirando > 0 ? "text-amber-500" : "text-muted-foreground", bg: expirando > 0 ? "bg-amber-500/10" : "bg-muted/40" },
    { label: "Trial", value: trial, icon: Clock, color: "text-muted-foreground", bg: "bg-muted/40" },
  ];

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border/40 rounded-xl border border-border/50 sm:grid-cols-4 sm:divide-y-0">
      {items.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="flex items-center gap-3 px-5 py-4">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${bg}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
          <div>
            <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ClientsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data: clients = [], isLoading } = useClients();
  const deleteClientMutation = useDeleteClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClienteComProjeto | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [clientForSubscription, setClientForSubscription] = useState<ClienteComProjeto | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.nome_entidade.toLowerCase().includes(q) ||
        c.tenant_code?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [clients, search]);

  const handleClientClick = (client: ClienteComProjeto) => navigate(`/clients/${client.project_id}`);
  const handleDeleteClick = (client: ClienteComProjeto) => { setClientToDelete(client); setDeleteDialogOpen(true); };
  const handleSubscriptionClick = (client: ClienteComProjeto) => { setClientForSubscription(client); setSubscriptionOpen(true); };
  const handleConfirmDelete = async () => {
    if (clientToDelete) await deleteClientMutation.mutateAsync(clientToDelete.project_id);
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
      <div className="space-y-6 animate-fade-in">
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
        <StatStrip clients={clients} />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, código ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onDelete={() => handleDeleteClick(client)}
                onSubscription={() => handleSubscriptionClick(client)}
                onClick={() => handleClientClick(client)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">
              {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            </p>
            <p className="mt-1 text-muted-foreground">
              {search
                ? "Tente ajustar sua busca"
                : "Adicione seu primeiro cliente para começar"}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => setIsModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Cliente
              </Button>
            )}
          </div>
        )}

        <AddTenantDialog open={isModalOpen} onOpenChange={setIsModalOpen} />

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
