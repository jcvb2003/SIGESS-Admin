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

export type SyncableSchemaDrift = {
  objectType: "view" | "index" | "policy" | "grant" | "auth_config" | "function" | "function_grant" | "trigger" | "column" | "constraint";
  schema: string;
  objectName: string;
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition";
  displayName: string;
  relatedDiffCount: number;
};

export type SchemaDriftOperation = {
  objectType: "view" | "index" | "policy" | "grant" | "auth_config" | "function" | "function_grant" | "trigger" | "column" | "constraint";
  schema: string;
  objectName: string;
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition";
  displayName: string;
  sql: string;
};

export type SchemaDriftPreview = {
  targets: Array<{ projectId: string; projectName: string }>;
  title: string;
  description: string;
  operations: SchemaDriftOperation[];
  sql: string;
};

export type SchemaDriftApplyResult = {
  projectId: string;
  projectName: string;
  status: "success" | "failed";
  error?: string;
};
