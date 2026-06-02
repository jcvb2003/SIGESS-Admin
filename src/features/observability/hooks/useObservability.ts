import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useClients } from "@/features/clients";
import { proxyAction } from "@/services/clients.service";
import { buildSchemaSyncActionKey } from "../utils/drift-utils";
import type {
  ExportRun,
  SchemaDriftPreview,
  SchemaDriftApplyResult,
  SchemaDriftOperation,
  SyncableSchemaDrift,
} from "../types";
import type { ProjectSchemaStatus } from "../model/schema-comparator";

type DriftTarget = { projectId: string; projectName: string };

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
  const functionAlign = operations.filter((op) => op.objectType === "function").length;
  const functionGrantAlign = operations.filter((op) => op.objectType === "function_grant").length;
  const triggerAlign = operations.filter((op) => op.objectType === "trigger").length;
  const grantAlign = operations.filter((op) => op.objectType === "grant").length;
  const authConfigAlign = operations.filter((op) => op.objectType === "auth_config").length;
  const columnAdd = operations.filter((op) => op.objectType === "column" && op.diffType === "missing_in_tenant").length;
  const columnDefault = operations.filter((op) => op.objectType === "column" && op.diffType === "different_definition").length;
  const constraintAlign = operations.filter((op) => op.objectType === "constraint").length;

  const lines: string[] = [];
  if (viewAlign > 0) lines.push(`${viewAlign} view${viewAlign > 1 ? "s" : ""} a alinhar`);
  if (functionAlign > 0) lines.push(`${functionAlign} função${functionAlign > 1 ? "ões" : ""} a alinhar`);
  if (functionGrantAlign > 0) lines.push(`${functionGrantAlign} grant${functionGrantAlign > 1 ? "s" : ""} de função a alinhar`);
  if (triggerAlign > 0) lines.push(`${triggerAlign} trigger${triggerAlign > 1 ? "s" : ""} a alinhar`);
  if (columnAdd > 0) lines.push(`${columnAdd} coluna${columnAdd > 1 ? "s" : ""} a adicionar`);
  if (columnDefault > 0) lines.push(`${columnDefault} default${columnDefault > 1 ? "s" : ""} a corrigir`);
  if (constraintAlign > 0) lines.push(`${constraintAlign} constraint${constraintAlign > 1 ? "s" : ""} a alinhar`);
  if (indexCreate > 0) lines.push(`${indexCreate} index${indexCreate > 1 ? "es" : ""} a criar`);
  if (indexRemove > 0) lines.push(`${indexRemove} index${indexRemove > 1 ? "es" : ""} a remover`);
  if (policyRecreate > 0) lines.push(`${policyRecreate} polic${policyRecreate > 1 ? "ies" : "y"} a recriar`);
  if (policyRemove > 0) lines.push(`${policyRemove} polic${policyRemove > 1 ? "ies" : "y"} a remover`);
  if (grantAlign > 0) lines.push(`${grantAlign} grant${grantAlign > 1 ? "s" : ""} a alinhar`);
  if (authConfigAlign > 0) lines.push(`${authConfigAlign} campo${authConfigAlign > 1 ? "s" : ""} de auth_config a sincronizar`);

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
  const functions = operations.filter((op) => op.objectType === "function");
  const functionGrants = operations.filter((op) => op.objectType === "function_grant");
  const triggers = operations.filter((op) => op.objectType === "trigger");
  const columns = operations.filter((op) => op.objectType === "column");
  const constraints = operations.filter((op) => op.objectType === "constraint");
  const grants = operations.filter((op) => op.objectType === "grant");
  const authConfig = operations.filter((op) => op.objectType === "auth_config");

  if (views.length > 0) {
    sections.push(
      `-- VIEWS (${views.length} a alinhar)\n${views.map((op) => op.sql.trim()).join("\n\n")}`,
    );
  }

  if (functions.length > 0) {
    sections.push(
      `-- FUNCTIONS (${functions.length} a alinhar)\n${functions.map((op) => op.sql.trim()).join("\n\n")}`,
    );
  }

  if (functionGrants.length > 0) {
    sections.push(
      `-- FUNCTION GRANTS (${functionGrants.length} a alinhar)\n${functionGrants
        .map((op) => op.sql.trim())
        .join("\n\n")}`,
    );
  }

  if (triggers.length > 0) {
    sections.push(
      `-- TRIGGERS (${triggers.length} a alinhar)\n${triggers.map((op) => op.sql.trim()).join("\n\n")}`,
    );
  }

  if (columns.length > 0) {
    sections.push(
      `-- COLUMNS (${columns.length} a alinhar)\n${columns.map((op) => op.sql.trim()).join("\n\n")}`,
    );
  }

  if (constraints.length > 0) {
    sections.push(
      `-- CONSTRAINTS (${constraints.length} a alinhar)\n${constraints.map((op) => op.sql.trim()).join("\n\n")}`,
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

  if (grants.length > 0) {
    sections.push(
      `-- GRANTS (${grants.length} a alinhar)\n${grants.map((op) => op.sql.trim()).join("\n\n")}`,
    );
  }

  if (authConfig.length > 0) {
    sections.push(
      `-- AUTH CONFIG (${authConfig.length} campo${authConfig.length > 1 ? "s" : ""})\n${authConfig
        .map((op) => op.sql.trim())
        .join("\n\n")}`,
    );
  }

  return sections.join("\n\n");
}

function buildPreviewSqlFromSegments(operations: SchemaDriftOperation[], segments: string[]) {
  const summary = buildOperationsSummary(operations);
  const content = segments.filter((segment) => segment.trim().length > 0);

  return [...summary, ...content].join("\n\n");
}

function sortOperations(operations: SyncableSchemaDrift[]) {
  const weight = (op: SyncableSchemaDrift) => {
    if (op.diffType === "extra_in_tenant") {
      if (op.objectType === "trigger") return 0;
      if (op.objectType === "function_grant") return 1;
      if (op.objectType === "function") return 2;
      if (op.objectType === "policy") return 3;
      if (op.objectType === "index") return 4;
      if (op.objectType === "grant") return 5;
      if (op.objectType === "auth_config") return 6;
      if (op.objectType === "view") return 7;
      return 99;
    }

    if (op.objectType === "view") return 0;
    if (op.objectType === "function") return 1;
    if (op.objectType === "function_grant") return 2;
    if (op.objectType === "trigger") return 3;
    if (op.objectType === "column") return 4;
    if (op.objectType === "constraint") return 5;
    if (op.objectType === "index") return 6;
    if (op.objectType === "policy") return 7;
    if (op.objectType === "grant") return 8;
    if (op.objectType === "auth_config") return 9;
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
  const { data: clients = [] } = useClients();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [driftPreview, setDriftPreview] = useState<SchemaDriftPreview | null>(null);
  const [isPreparingDrift, setIsPreparingDrift] = useState<string | null>(null);
  const [isApplyingDrift, setIsApplyingDrift] = useState(false);
  const [driftApplyResults, setDriftApplyResults] = useState<SchemaDriftApplyResult[]>([]);

  // Ad hoc comparison state
  const [adHocReferenceId, setAdHocReferenceId] = useState<string | null>(null);
  const [adHocTargetId, setAdHocTargetId] = useState<string | null>(null);
  const [adHocResults, setAdHocResults] = useState<ProjectSchemaStatus[] | null>(null);
  const [isRunningAdHocAudit, setIsRunningAdHocAudit] = useState(false);

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

  const handleRunAdHocAudit = async () => {
    if (!adHocReferenceId) return;
    setIsRunningAdHocAudit(true);
    setAdHocResults(null);
    try {
      const { data, error } = await supabase.functions.invoke("schema-audit", {
        body: {
          referenceProjectId: adHocReferenceId,
          ...(adHocTargetId ? { targetProjectId: adHocTargetId } : {}),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const mapped: ProjectSchemaStatus[] = (data?.results ?? [])
        .filter((r: any) => !r.error && r.tenantId !== adHocReferenceId)
        .map((r: any) => ({
          projectId: r.tenantId,
          projectName: r.projectName,
          checkedAt: new Date().toISOString(),
          totalDiffs: r.totalDiffs ?? 0,
          diffs: r.diffs ?? [],
          summary: r.summary ?? { total: 0, byCategory: {} },
        }));

      setAdHocResults(mapped);
      toast.success("Comparação concluída.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na comparação ad hoc");
    } finally {
      setIsRunningAdHocAudit(false);
    }
  };

  const handleClearAdHoc = () => {
    setAdHocReferenceId(null);
    setAdHocTargetId(null);
    setAdHocResults(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["global-export-runs"] });
      handleClearAdHoc();
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
          objectType: "view" | "index" | "policy" | "grant" | "auth_config" | "function" | "function_grant" | "trigger" | "column" | "constraint";
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

    const actionKey = buildSchemaSyncActionKey(targets, operationsToPrepare);
    setIsPreparingDrift(actionKey);
    try {
      const primaryTarget = targets[0];
      if (!primaryTarget) throw new Error("Nenhum tenant selecionado para sync.");

      const operations: SchemaDriftOperation[] = [];
      const previewSegments: string[] = [];
      const batchOps = operationsToPrepare.filter((operation) => operation.objectType !== "auth_config");
      const authConfigOps = operationsToPrepare.filter((operation) => operation.objectType === "auth_config");

      if (batchOps.length > 0) {
        const data = await proxyAction(primaryTarget.projectId, "apply-schema-drift", {
          operations: batchOps.map((operation) => ({
            objectType: operation.objectType,
            objectName: operation.objectName,
            schema: operation.schema,
            diffType: operation.diffType,
          })),
          mode: "dry-run",
          ...(adHocReferenceId ? { referenceProjectId: adHocReferenceId } : {}),
        });

        if (!data?.sql) {
          throw new Error("Dry-run batch nao retornou SQL para revisao.");
        }

        operations.push(
          ...batchOps.map((operation) => ({
            objectType: operation.objectType,
            objectName: operation.objectName,
            schema: operation.schema,
            diffType: operation.diffType,
            displayName: operation.displayName,
            sql: "",
          })),
        );
        previewSegments.push(data.sql);
      }

      for (const operation of authConfigOps) {
        const data = await proxyAction(primaryTarget.projectId, "apply-schema-drift", {
          objectType: operation.objectType,
          objectName: operation.objectName,
          schema: operation.schema,
          diffType: operation.diffType,
          mode: "dry-run",
          ...(adHocReferenceId ? { referenceProjectId: adHocReferenceId } : {}),
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
        previewSegments.push(data.sql);
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
            ? `1 operação ${operations[0].diffType === "extra_in_tenant" ? "remove o objeto extra" : "alinha o objeto com Rayssa"}.`
            : "Lote preparado a partir do estado real do Rayssa, separado por tipo de objeto."),
        operations,
        sql: buildPreviewSqlFromSegments(operations, previewSegments),
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

      const batchOps = driftPreview.operations.filter((operation) => operation.objectType !== "auth_config");
      const authConfigOps = driftPreview.operations.filter((operation) => operation.objectType === "auth_config");

      if (batchOps.length > 0) {
        try {
          await proxyAction(target.projectId, "apply-schema-drift", {
            operations: batchOps.map((operation) => ({
              objectType: operation.objectType,
              objectName: operation.objectName,
              schema: operation.schema,
              diffType: operation.diffType,
            })),
            mode: "apply",
            ...(adHocReferenceId ? { referenceProjectId: adHocReferenceId } : {}),
          });
        } catch (err) {
          failures.push(
            `Lote de ${batchOps.length} operaÃ§Ãµes: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
          );
        }
      }

      for (const operation of authConfigOps) {
        try {
          await proxyAction(target.projectId, "apply-schema-drift", {
            objectType: operation.objectType,
            objectName: operation.objectName,
            schema: operation.schema,
            diffType: operation.diffType,
            mode: "apply",
            ...(adHocReferenceId ? { referenceProjectId: adHocReferenceId } : {}),
          });
        } catch (err) {
          failures.push(
            `${operation.displayName}: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
          );
        }
      }

      if (failures.length === 0) {
        results.push({ projectId: target.projectId, projectName: target.projectName, status: "success" });
      } else {
        results.push({
          projectId: target.projectId,
          projectName: target.projectName,
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
    } else if (failureCount > 0) {
      toast.error("Nenhum tenant foi sincronizado. Revise o relatorio do apply.");
    }
  };

  return {
    clients,
    exportRuns,
    adHocReferenceId,
    setAdHocReferenceId,
    adHocTargetId,
    setAdHocTargetId,
    adHocResults,
    isRunningAdHocAudit,
    handleRunAdHocAudit,
    handleClearAdHoc,
    isLoadingExports,
    isRefreshing,
    isPreparingDrift,
    isApplyingDrift,
    driftPreview,
    driftApplyResults,
    setDriftPreview,
    setDriftApplyResults,
    handleRefresh,
    handlePrepareSchemaSync,
    handleApplySchemaSync,
  };
}
