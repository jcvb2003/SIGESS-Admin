export type SyncableSchemaDrift = {
  objectType: "view" | "index" | "policy" | "grant" | "auth_config" | "function" | "function_grant" | "trigger" | "column" | "constraint" | "rls_state" | "extensions" | "table" | "enum_type" | "edge_functions";
  schema: string;
  objectName: string;
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition";
  displayName: string;
  relatedDiffCount: number;
};

export type SchemaDriftOperation = {
  objectType: "view" | "index" | "policy" | "grant" | "auth_config" | "function" | "function_grant" | "trigger" | "column" | "constraint" | "rls_state" | "extensions" | "table" | "enum_type" | "edge_functions";
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
