import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Building2, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectDetail } from "../hooks/useProjectDetail";
import { useClienteDetail } from "../hooks/useClienteDetail";
import { useRuntimeMetadataSync } from "../hooks/useRuntimeMetadataSync";
import { EditClienteModal } from "../components/EditClienteModal";
import { ClienteCommercialCard } from "../components/ClienteCommercialCard";
import { ClienteDetailHeader } from "../components/ClienteDetailHeader";
import { SharedUsersTab, UsersTab, UnitsTab } from "@/features/clients";
import { hasClientePolos, hasClienteUsers } from "../utils/cliente-detail";
import type { RuntimeProjectMetadata } from "@/services/runtime-tenants.service";

export default function ClienteDetailPage() {
  const { id: projectId, clienteId } = useParams<{ id: string; clienteId: string }>();
  const navigate = useNavigate();

  const [editOpen, setEditOpen] = useState(false);
  const [runtimeMetadata, setRuntimeMetadata] = useState<RuntimeProjectMetadata | null>(null);

  const { data: project, isLoading: loadingProject } = useProjectDetail(projectId!);
  const { data: cliente, isLoading: loadingCliente, refetch } = useClienteDetail(clienteId!);
  const syncRuntime = useRuntimeMetadataSync(projectId!, clienteId);
  const isLoading = loadingProject || loadingCliente;

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!project || !cliente) {
    return (
      <MainLayout>
        <div className="flex h-64 flex-col items-center justify-center gap-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <h2 className="text-xl font-bold">Tenant nao encontrado</h2>
          <Button variant="link" onClick={() => navigate(`/clients/${projectId}`)}>
            Voltar ao projeto
          </Button>
        </div>
      </MainLayout>
    );
  }

  const showUnits = hasClientePolos(project.topology);
  const showUsers = hasClienteUsers(project.topology);
  const defaultTab = showUsers ? "users" : "units";
  const activeRuntimeTenantId = runtimeMetadata?.runtime_tenant_id ?? cliente.runtime_tenant_id;

  const handleSyncRuntime = async () => {
    try {
      const metadata = await syncRuntime.mutateAsync();
      setRuntimeMetadata(metadata);
      toast.success("Metadados de runtime sincronizados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao sincronizar runtime.");
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <ClienteDetailHeader
          cliente={cliente}
          projectName={project.project_name}
          onBack={() => navigate(`/clients/${projectId}`)}
          onEdit={() => setEditOpen(true)}
        />

        <ClienteCommercialCard
          cliente={cliente}
          runtimeMetadata={runtimeMetadata}
          onSyncRuntime={handleSyncRuntime}
          isSyncingRuntime={syncRuntime.isPending}
        />

        {project.topology !== "unconfigured" && (
          <Tabs defaultValue={defaultTab} className="space-y-4">
            <TabsList className="bg-secondary/50">
              {showUsers && (
                <TabsTrigger value="users" className="gap-2">
                  <Users className="h-4 w-4" />
                  Usuarios
                </TabsTrigger>
              )}
              {showUnits && (
                <TabsTrigger value="units" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  Polos
                </TabsTrigger>
              )}
            </TabsList>

            {showUsers && (
              <TabsContent value="users">
                {project.topology === "shared_multi_single" ? (
                  activeRuntimeTenantId ? (
                    <SharedUsersTab project={project} tenantId={activeRuntimeTenantId} showGestor={showUnits} />
                  ) : (
                    <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
                      <Users className="h-7 w-7 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        Este tenant ainda nao possui um ID runtime associado.
                      </p>
                    </Card>
                  )
                ) : (
                  <UsersTab
                    clientId={projectId!}
                    connectionError={null}
                    onUsersLoaded={() => {}}
                  />
                )}
              </TabsContent>
            )}

            {showUnits && (
              <TabsContent value="units">
                {activeRuntimeTenantId ? (
                  <UnitsTab project={project} tenantId={activeRuntimeTenantId} />
                ) : (
                  <Card className="flex flex-col items-center justify-center gap-2 border-dashed p-10 text-center">
                    <Building2 className="h-7 w-7 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Este tenant ainda nao possui um ID runtime associado.
                    </p>
                  </Card>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        <EditClienteModal
          cliente={cliente}
          project={project}
          open={editOpen}
          onOpenChange={setEditOpen}
          onUpdated={() => {
            refetch();
            setEditOpen(false);
          }}
          onDeleted={() => navigate(`/clients/${projectId}`)}
        />
      </div>
    </MainLayout>
  );
}
