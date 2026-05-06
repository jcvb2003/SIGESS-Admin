export const DATABASE_SNAPSHOT_QUERY = `
SELECT json_build_object(

  'tables', (
    SELECT json_agg(c.relname ORDER BY c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),

  'views', (
    SELECT json_agg(c.relname ORDER BY c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v','m')
  ),

  'columns', (
    SELECT json_agg(
      json_build_object(
        'table', c.table_name,
        'column', c.column_name,
        'data_type', c.data_type,
        'udt_name', c.udt_name,
        'is_nullable', c.is_nullable = 'YES',
        'column_default', c.column_default,
        'char_max_length', c.character_maximum_length,
        'numeric_precision', c.numeric_precision,
        'numeric_scale', c.numeric_scale,
        'datetime_precision', c.datetime_precision
      ) ORDER BY c.table_name, c.ordinal_position
    )
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
  ),

  'functions', (
    SELECT coalesce(json_agg(
      json_build_object(
        'name', p.proname,
        'identity_args', pg_get_function_identity_arguments(p.oid),
        'result_type', pg_get_function_result(p.oid),
        'language', l.lanname,
        'security_definer', p.prosecdef,
        'config', p.proconfig,
        'definition_hash', md5(replace(pg_get_functiondef(p.oid), chr(13), '')),
        'is_trigger_function', p.prorettype = 'trigger'::regtype::oid
      ) ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
    ), '[]'::json)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND l.lanname != 'c'
  ),

  'triggers', (
    SELECT coalesce(json_agg(
      json_build_object(
        'name', tg.tgname,
        'table', cls.relname,
        'enabled', tg.tgenabled,
        'function_name', p.proname,
        'definition', pg_get_triggerdef(tg.oid, true)
      ) ORDER BY cls.relname, tg.tgname
    ), '[]'::json)
    FROM pg_trigger tg
    JOIN pg_class cls ON cls.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = cls.relnamespace
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE n.nspname = 'public'
      AND NOT tg.tgisinternal
  ),

  'rls_state', (
    SELECT json_agg(
      json_build_object(
        'table', c.relname,
        'rls_enabled', c.relrowsecurity,
        'rls_forced', c.relforcerowsecurity
      ) ORDER BY c.relname
    )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  ),

  'policies', (
    SELECT coalesce(json_agg(
      json_build_object(
        'schema', schemaname,
        'table', tablename,
        'name', policyname,
        'cmd', cmd,
        'roles', roles,
        'qual', qual,
        'with_check', with_check
      ) ORDER BY schemaname, tablename, policyname
    ), '[]'::json)
    FROM pg_policies
    WHERE schemaname = 'public'
  ),

  'indexes', (
    SELECT coalesce(json_agg(
      json_build_object(
        'table', tablename,
        'name', indexname,
        'definition', indexdef
      ) ORDER BY tablename, indexname
    ), '[]'::json)
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT LIKE '%_pkey'
  ),

  'constraints', (
    SELECT coalesce(json_agg(
      json_build_object(
        'table', rel.relname,
        'name', con.conname,
        'type', con.contype,
        'definition', pg_get_constraintdef(con.oid, true)
      ) ORDER BY rel.relname, con.conname
    ), '[]'::json)
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
  ),

  'extensions', (
    SELECT coalesce(json_agg(
      json_build_object('name', extname, 'version', extversion)
      ORDER BY extname
    ), '[]'::json)
    FROM pg_extension
  ),

  'enums_and_domains', (
    SELECT coalesce(json_agg(
      json_build_object(
        'schema', n.nspname,
        'name', t.typname,
        'kind', CASE WHEN t.typtype = 'e' THEN 'enum' WHEN t.typtype = 'd' THEN 'domain' END,
        'definition', CASE
          WHEN t.typtype = 'e' THEN (
            SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
            FROM pg_enum e WHERE e.enumtypid = t.oid
          )
          WHEN t.typtype = 'd' THEN pg_catalog.format_type(t.typbasetype, t.typtypmod)
        END
      ) ORDER BY t.typname
    ), '[]'::json)
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('e','d')
  ),

  'grants', (
    SELECT coalesce(json_agg(
      json_build_object(
        'table', table_name,
        'grantee', grantee,
        'privileges', privileges
      ) ORDER BY table_name, grantee
    ), '[]'::json)
    FROM (
      SELECT table_name, grantee,
        string_agg(privilege_type, ',' ORDER BY privilege_type) as privileges
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('authenticated', 'anon', 'service_role')
      GROUP BY table_name, grantee
    ) g
  )

) as snapshot;
`;

export const STORAGE_SNAPSHOT_QUERY = `
SELECT json_build_object(
  'buckets', (
    SELECT coalesce(json_agg(
      json_build_object('id', id, 'name', name, 'public', public)
      ORDER BY name
    ), '[]'::json) FROM storage.buckets
  ),
  'policies', (
    SELECT coalesce(json_agg(
      json_build_object(
        'table', tablename, 'name', policyname,
        'cmd', cmd, 'roles', roles,
        'qual', qual, 'with_check', with_check
      ) ORDER BY tablename, policyname
    ), '[]'::json)
    FROM pg_policies WHERE schemaname = 'storage'
  )
) as snapshot;
`;

export interface ColumnDef {
  table: string;
  column: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  column_default: string | null;
  char_max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  datetime_precision: number | null;
}

export interface FunctionDef {
  name: string;
  identity_args: string;
  result_type: string;
  language: string;
  security_definer: boolean;
  config: string[] | null;
  definition_hash: string;
  is_trigger_function: boolean;
}

export interface TriggerDef {
  name: string;
  table: string;
  enabled: string;
  function_name: string;
  definition: string;
}

export interface ConstraintDef {
  table: string;
  name: string;
  type: string;
  definition: string;
}

export interface IndexDef {
  table: string;
  name: string;
  definition: string;
}

export interface PolicyDef {
  schema: string;
  table: string;
  name: string;
  cmd: string;
  roles: string[] | string | null;
  qual: string | null;
  with_check: string | null;
}

export interface RLSState {
  table: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

export interface EnumOrDomainDef {
  schema: string;
  name: string;
  kind: 'enum' | 'domain';
  definition: string;
}

export interface ExtensionDef {
  name: string;
  version: string;
}

export interface GrantDef {
  table: string;
  grantee: string;
  privileges: string;
}

export interface StorageBucketDef {
  id: string;
  name: string;
  public: boolean;
}

export interface SchemaSnapshot {
  tables: string[];
  views: string[];
  columns: ColumnDef[];
  functions: FunctionDef[];
  triggers: TriggerDef[];
  rls_state: RLSState[];
  policies: PolicyDef[];
  indexes: IndexDef[];
  constraints: ConstraintDef[];
  extensions: ExtensionDef[];
  enums_and_domains: EnumOrDomainDef[];
  grants: GrantDef[];
}

export interface StorageSnapshot {
  buckets: StorageBucketDef[];
  policies: PolicyDef[];
}

export interface AuthConfig {
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_sender_name?: string;
  external_email_enabled?: boolean;
  external_phone_enabled?: boolean;
  mailer_autoconfirm?: boolean;
  sms_autoconfirm?: boolean;
  external_google_enabled?: boolean;
  [key: string]: any;
}

export interface EdgeFunctionDef {
  id: string;
  name: string;
  version: string;
  created_at: string;
  updated_at: string;
  verify_jwt: boolean;
  [key: string]: any;
}

export type DiffCategory = 
  | 'tables'
  | 'views'
  | 'columns'
  | 'functions'
  | 'triggers'
  | 'rls_state'
  | 'policies'
  | 'indexes'
  | 'constraints'
  | 'extensions'
  | 'enums_and_domains'
  | 'grants'
  | 'buckets'
  | 'storage_policies'
  | 'auth_config'
  | 'edge_functions';

export interface SchemaDiff {
  category: DiffCategory;
  key: string;
  type: 'missing_in_tenant' | 'extra_in_tenant' | 'different_definition';
  oeiras_value?: any;
  tenant_value?: any;
}

export interface DiffSummary {
  total: number;
  byCategory: Record<string, number>;
}

export interface TenantSchemaStatus {
  tenantId: string;
  tenantName: string;
  checkedAt: string;
  totalDiffs: number;
  diffs: SchemaDiff[];
  summary: DiffSummary;
}

function compareArrays<T>(
  oeirasList: T[], 
  tenantList: T[], 
  category: DiffCategory, 
  getKey: (item: T) => string, 
  compareItems: (oItem: T, tItem: T) => { isEqual: boolean, oVal?: any, tVal?: any }
): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];
  const oeirasMap = new Map<string, T>();
  const tenantMap = new Map<string, T>();

  oeirasList.forEach(item => oeirasMap.set(getKey(item), item));
  tenantList.forEach(item => tenantMap.set(getKey(item), item));

  // O que tem no Oeiras e falta no tenant ou está diferente
  oeirasMap.forEach((oItem, key) => {
    if (!tenantMap.has(key)) {
      diffs.push({
        category,
        key,
        type: 'missing_in_tenant',
        oeiras_value: oItem
      });
    } else {
      const tItem = tenantMap.get(key)!;
      const comp = compareItems(oItem, tItem);
      if (!comp.isEqual) {
        diffs.push({
          category,
          key,
          type: 'different_definition',
          oeiras_value: comp.oVal || oItem,
          tenant_value: comp.tVal || tItem
        });
      }
    }
  });

  // O que tem no tenant e falta no Oeiras
  tenantMap.forEach((tItem, key) => {
    if (!oeirasMap.has(key)) {
      diffs.push({
        category,
        key,
        type: 'extra_in_tenant',
        tenant_value: tItem
      });
    }
  });

  return diffs;
}

export function compareSnapshots(
  oeiras: SchemaSnapshot, 
  tenant: SchemaSnapshot,
  oeirasStorage: StorageSnapshot | null,
  tenantStorage: StorageSnapshot | null,
  oeirasAuth: AuthConfig | null,
  tenantAuth: AuthConfig | null,
  oeirasFunctions: EdgeFunctionDef[] | null,
  tenantFunctions: EdgeFunctionDef[] | null
): SchemaDiff[] {
  const diffs: SchemaDiff[] = [];

  const genericCompare = (o: any, t: any) => ({ isEqual: JSON.stringify(o) === JSON.stringify(t) });

  // Simple string arrays (tables, views)
  diffs.push(...compareArrays(oeiras.tables || [], tenant.tables || [], 'tables', t => t, genericCompare));
  diffs.push(...compareArrays(oeiras.views || [], tenant.views || [], 'views', v => v, genericCompare));

  // Columns
  diffs.push(...compareArrays(oeiras.columns || [], tenant.columns || [], 'columns', 
    c => `${c.table}.${c.column}`, genericCompare));

  // Functions
  diffs.push(...compareArrays(oeiras.functions || [], tenant.functions || [], 'functions', 
    f => `${f.name}(${f.identity_args})`, genericCompare));

  // Triggers
  diffs.push(...compareArrays(oeiras.triggers || [], tenant.triggers || [], 'triggers', 
    t => `${t.table}.${t.name}`, genericCompare));

  // Constraints
  diffs.push(...compareArrays(oeiras.constraints || [], tenant.constraints || [], 'constraints', 
    c => `${c.table}.${c.name}`, genericCompare));

  // Indexes
  diffs.push(...compareArrays(oeiras.indexes || [], tenant.indexes || [], 'indexes', 
    i => `${i.table}.${i.name}`, genericCompare));

  // Policies
  diffs.push(...compareArrays(oeiras.policies || [], tenant.policies || [], 'policies', 
    p => `${p.schema}.${p.table}.${p.name}`, genericCompare));

  // RLS State
  diffs.push(...compareArrays(oeiras.rls_state || [], tenant.rls_state || [], 'rls_state', 
    r => r.table, genericCompare));

  // Enums/Domains
  diffs.push(...compareArrays(oeiras.enums_and_domains || [], tenant.enums_and_domains || [], 'enums_and_domains', 
    e => `${e.schema}.${e.name}`, genericCompare));

  // Extensions
  diffs.push(...compareArrays(oeiras.extensions || [], tenant.extensions || [], 'extensions', 
    e => e.name, genericCompare));

  // Grants
  diffs.push(...compareArrays(oeiras.grants || [], tenant.grants || [], 'grants', 
    g => `${g.table}.${g.grantee}`, genericCompare));

  // Storage
  if (oeirasStorage && tenantStorage) {
    diffs.push(...compareArrays(oeirasStorage.buckets || [], tenantStorage.buckets || [], 'buckets', 
      b => b.name, genericCompare));
    diffs.push(...compareArrays(oeirasStorage.policies || [], tenantStorage.policies || [], 'storage_policies', 
      p => `${p.table}.${p.name}`, genericCompare));
  }

  // Edge Functions
  if (oeirasFunctions && tenantFunctions) {
    diffs.push(...compareArrays(oeirasFunctions || [], tenantFunctions || [], 'edge_functions', 
      f => f.name, (o, t) => {
        // Compare verify_jwt explicitly or just consider them the same if name exists?
        // Let's compare verify_jwt
        const isEqual = o.verify_jwt === t.verify_jwt;
        return { isEqual, oVal: { verify_jwt: o.verify_jwt }, tVal: { verify_jwt: t.verify_jwt } };
      }));
  }

  // Auth Config
  if (oeirasAuth && tenantAuth) {
    const AUTH_FIELDS_TO_COMPARE = [
      'smtp_host',
      'smtp_port', 
      'smtp_user',
      'smtp_sender_name',
      'external_email_enabled',
      'external_phone_enabled',
      'mailer_autoconfirm',
      'sms_autoconfirm',
      'external_google_enabled',
    ];
    
    AUTH_FIELDS_TO_COMPARE.forEach(field => {
      const oVal = oeirasAuth[field];
      const tVal = tenantAuth[field];
      if (oVal !== tVal) {
        diffs.push({
          category: 'auth_config',
          key: field,
          type: 'different_definition',
          oeiras_value: oVal,
          tenant_value: tVal
        });
      }
    });
  }

  return diffs;
}

export function summarizeDiff(diffs: SchemaDiff[]): DiffSummary {
  const byCategory: Record<string, number> = {};
  for (const diff of diffs) {
    byCategory[diff.category] = (byCategory[diff.category] || 0) + 1;
  }
  return {
    total: diffs.length,
    byCategory
  };
}
