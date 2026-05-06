import type { Client } from "@/features/clients";

export type ExportRun = {
  id: string;
  run_id: string | null;
  tenant_code: string | null;
  tenant_name: string | null;
  tabela: string | null;
  status: "running" | "success" | "failed" | "skipped" | null;
  skip_reason: string | null;
  file_size_bytes: number | null;
  error_detail: string | null;
  executed_at: string | null;
};

export type ImportRecord = {
  id: string;
  tenant_id: string | null;
  tabela: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_registros: number;
  created_at: string;
  erro_detalhe: string | null;
};

export type TenantSnapshot = {
  client: Client;
  imports: ImportRecord[];
};

export type SyncableViewDrift = {
  schema: string;
  objectName: string;
  relatedDiffCount: number;
};

export type SchemaDriftPreview = {
  targets: Array<{ clientId: string; tenantName: string }>;
  schema: string;
  objectName: string;
  sql: string;
};

export type SchemaDriftApplyResult = {
  clientId: string;
  tenantName: string;
  status: "success" | "failed";
  error?: string;
};
