import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClients } from "@/features/clients";
import { proxyAction } from "@/services/clients.service";
import { getSchemaSyncStatus, runSchemaAudit } from "../services/schema-sync.service";
import type { 
  ExportRun, 
  ImportRecord, 
  TenantSnapshot, 
  SchemaDriftPreview, 
  SchemaDriftApplyResult 
} from "../types";
import { TenantSchemaStatus } from "../model/schema-comparator";

export function useObservability() {
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading: isLoadingClients } = useClients();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [driftPreview, setDriftPreview] = useState<SchemaDriftPreview | null>(null);
  const [isPreparingDrift, setIsPreparingDrift] = useState<string | null>(null);
  const [isApplyingDrift, setIsApplyingDrift] = useState(false);
  const [driftApplyResults, setDriftApplyResults] = useState<SchemaDriftApplyResult[]>([]);

  const queryImports = useQuery<ImportRecord[]>({
    queryKey: ["global-data-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_imports")
        .select("id, tenant_id, tabela, status, total_registros, created_at, erro_detalhe")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as ImportRecord[]) ?? [];
    },
  });
  const allImports = useMemo(() => queryImports.data ?? [], [queryImports.data]);
  const isLoadingImports = queryImports.isLoading;

  const snapshots = useMemo<TenantSnapshot[]>(() => {
    const importsByTenant = new Map<string, ImportRecord[]>();

    for (const item of allImports) {
      if (!item.tenant_id) continue;
      const group = importsByTenant.get(item.tenant_id) ?? [];
      group.push(item);
      importsByTenant.set(item.tenant_id, group);
    }

    return clients.map((client) => ({
      client,
      imports: importsByTenant.get(client.id) ?? [],
    }));
  }, [allImports, clients]);

  const queryExports = useQuery<ExportRun[]>({
    queryKey: ["global-export-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("export_runs")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data as unknown as ExportRun[]) ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
  const exportRuns = queryExports.data ?? [];
  const isLoadingExports = queryExports.isLoading;

  const querySchema = useQuery<TenantSchemaStatus[]>({
    queryKey: ["global-schema-status"],
    queryFn: getSchemaSyncStatus,
    staleTime: 1000 * 60 * 5,
  });
  const schemaStatus = querySchema.data ?? [];
  const isLoadingSchema = querySchema.isLoading;

  const [isAuditingSchema, setIsAuditingSchema] = useState(false);
  const handleRunSchemaAudit = async () => {
    setIsAuditingSchema(true);
    try {
      await runSchemaAudit();
      toast.success("Auditoria de Schema finalizada com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["global-schema-status"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro desconhecido na auditoria.");
    } finally {
      setIsAuditingSchema(false);
    }
  };

  const overview = useMemo(() => {
    const healthy = snapshots.filter((item) => item.client.key_status === "valid").length;
    const publicConfigOk = clients.filter((c) => !!(c.tenant_code && c.supabase_publishable_key)).length;
    const failedImports = snapshots.reduce(
      (acc, item) => acc + item.imports.filter((entry) => entry.status === "failed").length,
      0,
    );
    const processingImports = snapshots.reduce(
      (acc, item) => acc + item.imports.filter((entry) => ["pending", "processing"].includes(entry.status)).length,
      0,
    );

    return {
      total: clients.length,
      healthy,
      publicConfigOk,
      failedImports,
      processingImports,
    };
  }, [snapshots, clients]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["global-schema-status"] });
      await queryClient.invalidateQueries({ queryKey: ["global-export-runs"] });
      toast.success("Observabilidade atualizada.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handlePrepareSchemaSync = async (
    targets: Array<{ clientId: string; tenantName: string }>,
    objectName: string,
    schema: string,
  ) => {
    const actionKey = `${targets.map((t) => t.clientId).join(",")}:${schema}.${objectName}`;
    setIsPreparingDrift(actionKey);
    try {
      const { data, error } = await supabase.functions.invoke("schema-audit", {
        body: {
          action: "get-oeiras-definition",
          params: { schema, objectName },
        },
      });

      if (error || data?.error) {
        throw new Error(error?.message || data?.error || "Erro ao obter definição");
      }

      setDriftPreview({
        targets,
        schema,
        objectName,
        sql: data.sql,
      });
      setDriftApplyResults([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao preparar sync");
    } finally {
      setIsPreparingDrift(null);
    }
  };

  const handleApplySchemaSync = async () => {
    if (!driftPreview) return;

    setIsApplyingDrift(true);
    const results: SchemaDriftApplyResult[] = [];

    for (const target of driftPreview.targets) {
      try {
        await proxyAction(target.clientId, "apply-schema-drift", {
          sql: driftPreview.sql,
        });
        results.push({ clientId: target.clientId, tenantName: target.tenantName, status: "success" });
      } catch (err) {
        results.push({
          clientId: target.clientId,
          tenantName: target.tenantName,
          status: "failed",
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }

    setDriftApplyResults(results);
    setIsApplyingDrift(false);

    const someSuccess = results.some((r) => r.status === "success");
    if (someSuccess) {
      toast.success("Apply finalizado. Rode uma auditoria para confirmar.");
      queryClient.invalidateQueries({ queryKey: ["global-schema-status"] });
    }
  };

  return {
    clients,
    allImports,
    exportRuns,
    schemaStatus,
    snapshots,
    overview,
    isLoadingClients,
    isLoadingImports,
    isLoadingExports,
    isLoadingSchema,
    isRefreshing,
    isAuditingSchema,
    isPreparingDrift,
    isApplyingDrift,
    driftPreview,
    driftApplyResults,
    setDriftPreview,
    setDriftApplyResults,
    handleRefresh,
    handleRunSchemaAudit,
    handlePrepareSchemaSync,
    handleApplySchemaSync,
  };
}
