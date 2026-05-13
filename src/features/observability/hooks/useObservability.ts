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
  SchemaDriftApplyResult,
  SchemaDriftOperation,
  SyncableSchemaDrift,
} from "../types";
import { TenantSchemaStatus } from "../model/schema-comparator";

type DriftTarget = { clientId: string; tenantName: string };

function buildOperationsSummary(operations: SchemaDriftOperation[]) {
  const indexCreate = operations.filter((op) => op.objectType === "index" && op.diffType !== "extra_in_tenant").length;
  const indexRemove = operations.filter((op) => op.objectType === "index" && op.diffType === "extra_in_tenant").length;
  const viewAlign = operations.filter((op) => op.objectType === "view").length;
  const policyRecreate = operations.filter(
    (op) => op.objectType === "policy" && op.diffType !== "extra_in_tenant",
  ).length;
  const policyRemove = operations.filter(
    (op) => op.objectType === "policy" && op.diffType === "extra_in_tenant",
  ).length;

  const lines: string[] = [];
  if (viewAlign > 0) lines.push(`${viewAlign} view${viewAlign > 1 ? "s" : ""} a alinhar`);
  if (indexCreate > 0) lines.push(`${indexCreate} index${indexCreate > 1 ? "es" : ""} a criar`);
  if (indexRemove > 0) lines.push(`${indexRemove} index${indexRemove > 1 ? "es" : ""} a remover`);
  if (policyRecreate > 0) lines.push(`${policyRecreate} polic${policyRecreate > 1 ? "ies" : "y"} a recriar`);
  if (policyRemove > 0) lines.push(`${policyRemove} polic${policyRemove > 1 ? "ies" : "y"} a remover`);

  return lines;
}

function buildPreviewSql(operations: SchemaDriftOperation[]) {
  const sections: string[] = [];
  const summary = buildOperationsSummary(operations);
  if (summary.length > 0) {
    sections.push(summary.join("\n"));
  }

  const views = operations.filter((op) => op.objectType === "view");
  const indexesToCreate = operations.filter((op) => op.objectType === "index" && op.diffType !== "extra_in_tenant");
  const indexesToRemove = operations.filter((op) => op.objectType === "index" && op.diffType === "extra_in_tenant");
  const policiesToRecreate = operations.filter((op) => op.objectType === "policy" && op.diffType !== "extra_in_tenant");
  const policiesToRemove = operations.filter((op) => op.objectType === "policy" && op.diffType === "extra_in_tenant");

  if (views.length > 0) {
    sections.push(
      `-- VIEWS (${views.length} a alinhar)\n${views.map((op) => op.sql.trim()).join("\n\n")}`,
    );
  }

  if (indexesToCreate.length > 0) {
    sections.push(
      `-- INDEXES (${indexesToCreate.length} a criar)\n${indexesToCreate.map((op) => op.sql.trim()).join("\n\n")}`,
    );
  }

  if (indexesToRemove.length > 0) {
    sections.push(
      `-- INDEXES EXTRAS (${indexesToRemove.length} a remover)\n${indexesToRemove
        .map((op) => op.sql.trim())
        .join("\n\n")}`,
    );
  }

  if (policiesToRecreate.length > 0) {
    sections.push(
      `-- POLICIES DIVERGENTES (${policiesToRecreate.length} DROP + CREATE)\n${policiesToRecreate
        .map((op) => op.sql.trim())
        .join("\n\n")}`,
    );
  }

  if (policiesToRemove.length > 0) {
    sections.push(
      `-- POLICIES EXTRAS NO TENANT (${policiesToRemove.length} apenas DROP)\n${policiesToRemove
        .map((op) => op.sql.trim())
        .join("\n\n")}`,
    );
  }

  return sections.join("\n\n");
}

function sortOperations(operations: SyncableSchemaDrift[]) {
  const weight = (op: SyncableSchemaDrift) => {
    if (op.objectType === "view") return 0;
    if (op.objectType === "index") return op.diffType === "extra_in_tenant" ? 2 : 1;
    if (op.objectType === "policy") return op.diffType === "extra_in_tenant" ? 4 : 3;
    return 99;
  };

  return [...operations].sort((a, b) => {
    const diff = weight(a) - weight(b);
    if (diff !== 0) return diff;
    return a.displayName.localeCompare(b.displayName);
  });
}

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
    targets: DriftTarget[],
    operationsInput:
      | SyncableSchemaDrift[]
      | {
          objectType: "view" | "index" | "policy";
          objectName: string;
          schema: string;
          diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition";
          displayName?: string;
          relatedDiffCount?: number;
        },
    previewMeta?: { title?: string; description?: string },
  ) => {
    const operationsToPrepare = Array.isArray(operationsInput)
      ? sortOperations(operationsInput)
      : sortOperations([
          {
            objectType: operationsInput.objectType,
            objectName: operationsInput.objectName,
            schema: operationsInput.schema,
            diffType: operationsInput.diffType,
            displayName:
              operationsInput.displayName ??
              `${operationsInput.schema}.${operationsInput.objectName}`,
            relatedDiffCount: operationsInput.relatedDiffCount ?? 1,
          },
        ]);

    const actionKey = `${targets.map((t) => t.clientId).join(",")}:${operationsToPrepare
      .map((op) => `${op.objectType}:${op.schema}.${op.objectName}:${op.diffType}`)
      .join("|")}`;
    setIsPreparingDrift(actionKey);
    try {
      const primaryTarget = targets[0];
      if (!primaryTarget) throw new Error("Nenhum tenant selecionado para sync.");

      const operations: SchemaDriftOperation[] = [];
      for (const operation of operationsToPrepare) {
        const data = await proxyAction(primaryTarget.clientId, "apply-schema-drift", {
          objectType: operation.objectType,
          objectName: operation.objectName,
          schema: operation.schema,
          diffType: operation.diffType,
          mode: "dry-run",
        });

        if (!data?.sql) {
          throw new Error(`Dry-run nao retornou SQL para revisao de ${operation.displayName}.`);
        }

        operations.push({
          objectType: operation.objectType,
          objectName: operation.objectName,
          schema: operation.schema,
          diffType: operation.diffType,
          displayName: operation.displayName,
          sql: data.sql,
        });
      }

      const defaultTitle =
        operations.length === 1
          ? operations[0].displayName
          : previewMeta?.title ?? `${operations.length} opera${operations.length > 1 ? "ções" : "ção"} de schema`;

      setDriftPreview({
        targets,
        title: defaultTitle,
        description:
          previewMeta?.description ??
          (operations.length === 1
            ? `1 operação ${operations[0].diffType === "extra_in_tenant" ? "remove o objeto extra" : "alinha o objeto com Oeiras"}.`
            : "Lote preparado a partir do estado real do Oeiras, separado por tipo de objeto."),
        operations,
        sql: buildPreviewSql(operations),
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
      const failures: string[] = [];

      for (const operation of driftPreview.operations) {
        try {
          await proxyAction(target.clientId, "apply-schema-drift", {
            objectType: operation.objectType,
            objectName: operation.objectName,
            schema: operation.schema,
            diffType: operation.diffType,
            mode: "apply",
          });
        } catch (err) {
          failures.push(
            `${operation.displayName}: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
          );
        }
      }

      if (failures.length === 0) {
        results.push({ clientId: target.clientId, tenantName: target.tenantName, status: "success" });
      } else {
        results.push({
          clientId: target.clientId,
          tenantName: target.tenantName,
          status: "failed",
          error: failures.join(" | "),
        });
      }
    }

    setDriftApplyResults(results);
    setIsApplyingDrift(false);

    const successCount = results.filter((r) => r.status === "success").length;
    const failureCount = results.length - successCount;

    if (successCount > 0) {
      const message =
        failureCount > 0
          ? `Apply concluido: ${successCount} sucesso(s), ${failureCount} falha(s).`
          : "Apply finalizado. Rode uma auditoria para confirmar.";
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["global-schema-status"] });
    } else if (failureCount > 0) {
      toast.error("Nenhum tenant foi sincronizado. Revise o relatorio do apply.");
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
