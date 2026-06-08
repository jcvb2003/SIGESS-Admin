// @ts-expect-error: Deno-specific URL imports
// @ts-expect-error: Deno-specific URL imports
import { createClient, SupabaseClient, User as AuthUser } from "https://esm.sh/@supabase/supabase-js@2";

interface PublicUser {
  id: string;
  email: string;
  role?: string;
  ativo?: boolean;
  acesso_expira_em?: string | null;
}

interface MergedMember extends AuthUser {
  isAdmin: boolean;
  role: string;
  ativo: boolean;
  hasLegacyMetadata: boolean;
  ban_duration?: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLOCKED = [
  /DROP\s+TABLE/i,
  /DROP\s+SCHEMA/i,
  /TRUNCATE/i,
  /ALTER\s+TYPE/i,
  /DELETE\s+FROM\s+\w+\s*($|;|\s+WHERE\s+true)/i,
];

const SHARED_GOVERNANCE_TABLES = new Set([
  "tenants",
  "tenant_units",
  "tenant_users",
  "user_profiles",
  "user_unit_memberships",
]);

const EXTENSION_APPLY_ALLOWLIST = new Set(["pg_trgm"]);

const ISOLATED_ANON_TABLE_GRANT_ALLOWLIST = new Set([
  "foto_upload_tokens",
]);

const ISOLATED_ANON_FUNCTION_GRANT_ALLOWLIST = new Set([
  "confirmar_upload_foto(uuid, text)",
]);

function isSafe(sql: string) {
  return !BLOCKED.some((r) => r.test(sql));
}

async function listUsers(clientUrl: string, clientKey: string) {
  const res = await fetch(`${clientUrl}/auth/v1/admin/users?page=1&per_page=100`, {
    headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Auth API error (${res.status}): ${errText}`);
  }
  return await res.json();
}

async function listClientMembers(clientUrl: string, clientKey: string) {
  // 1. Fetch from Auth
  const authRes = await fetch(`${clientUrl}/auth/v1/admin/users?page=1&per_page=100`, {
    headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    throw new Error(`Auth API error (${authRes.status}): ${errText}`);
  }

  const authData = await authRes.json();
  const authUsers = authData.users || [];

  // 2. Merge including app_metadata and role
  const merged: MergedMember[] = authUsers.map((au: AuthUser) => {
    const roleFromMetadata = au.app_metadata?.role;
    const isAdmin = roleFromMetadata === 'admin' || au.app_metadata?.is_admin === true;
    const finalRole = isAdmin ? 'admin' : (roleFromMetadata || 'user');

    const bannedUntilRaw = (au as any).banned_until;
    const bannedUntil = (bannedUntilRaw && bannedUntilRaw !== '') ? new Date(bannedUntilRaw) : null;
    const isAtivo = !(bannedUntil && bannedUntil > new Date());

    return {
      ...au,
      isAdmin: finalRole === 'admin',
      role: finalRole,
      ativo: isAtivo,
      hasLegacyMetadata: !!au.app_metadata?.is_admin
    } as MergedMember;
  });

  return { users: merged };
}

async function updateClientMember(clientUrl: string, clientKey: string, params?: Record<string, unknown>) {
  const { userId, updates } = params as { userId: string, updates: Record<string, unknown> };
  if (!userId || !updates) throw new Error("Missing userId or updates");

  const results: Record<string, unknown> = {};

  // 1. If updating role, we must sync in BOTH places
  if (updates.role) {
    const role = updates.role;

    // Update Auth Metadata (Highest Priority for the Client App logic)
    const authRes = await fetch(`${clientUrl}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: {
        apikey: clientKey,
        Authorization: `Bearer ${clientKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        app_metadata: { role }, // Removed is_admin (Deprecated)
        user_metadata: { role } 
      })
    });
    if (!authRes.ok) throw new Error(`Auth Sync failed: ${await authRes.text()}`);
    results.authSync = "success";
  }

  return results;
}

async function createClientUser(clientUrl: string, clientKey: string, params?: Record<string, unknown>, limits?: { acesso_expira_em: string | null, max_socios: number | null }, tenantCode?: string) {
  const { email, role, password, autoConfirm } = params as {
    email: string,
    role: string,
    password?: string,
    autoConfirm?: boolean
  };

  if (!email) throw new Error("Missing email for new user");

  const supabase = createClient(clientUrl, clientKey);

  // 1. If password provided, use createUser via raw fetch (exposes real Auth error message)
  if (password) {
    const createRes = await fetch(`${clientUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: clientKey,
        Authorization: `Bearer ${clientKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: autoConfirm ?? true,
        app_metadata: { role },
        user_metadata: { role },
      }),
    });

    const createBody = await createRes.json().catch(() => ({}));

    if (!createRes.ok) {
      const authMsg = createBody?.msg || createBody?.message || createBody?.error_description || createBody?.error || `Auth create failed (${createRes.status})`;
      throw createHttpError(`Erro ao criar usuário no Auth: ${authMsg}`, createRes.status);
    }

    const newUser = createBody;

    if (newUser?.id) {
      // Ensure app_metadata.role is clean
      await fetch(`${clientUrl}/auth/v1/admin/users/${newUser.id}`, {
        method: "PUT",
        headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ app_metadata: { role } }),
      });

    }

    return { user: newUser, mode: 'direct' };
  }

  // 2. Otherwise use Invite (Magic Link)
  const inviteRedirectTo = tenantCode
    ? `https://app.sigess.com.br/password?tenant=${encodeURIComponent(tenantCode)}`
    : undefined;

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role },
    ...(inviteRedirectTo && { options: { redirectTo: inviteRedirectTo } }),
  });

  if (error) throw error;

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { role },
      ...(inviteRedirectTo && { redirectTo: inviteRedirectTo })
    }
  });

  if (data.user) {
    await supabase.auth.admin.updateUserById(data.user.id, {
      app_metadata: { role }
    });
  }

  return {
    user: data.user,
    mode: 'invite',
    inviteLink: linkError ? null : (linkData?.properties?.action_link ?? null)
  };
}

async function deleteClientUser(clientUrl: string, clientKey: string, userId: string) {
  const supabase = createClient(clientUrl, clientKey);
  
  // 1. Delete from Auth (Triggers should handle cleanup if configured, but we'll be explicit)
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) throw authError;

  return { success: true };
}

async function banClientUser(clientUrl: string, clientKey: string, userId: string, active: boolean) {
  const supabase = createClient(clientUrl, clientKey);
  
  // Follow client app logic: ban_duration '876600h' for inactive
  const banDuration = active ? 'none' : '876600h';
  
  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: banDuration
  });
  if (authError) throw authError;

  return { success: true, active };
}

async function listTables(clientUrl: string, clientKey: string) {
  const res = await fetch(`${clientUrl}/rest/v1/`, {
    headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`REST API error (${res.status}): ${errText}`);
  }
  return await res.json();
}

async function listBuckets(clientUrl: string, clientKey: string) {
  const supabase = createClient(clientUrl, clientKey);
  const { data, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  return data || [];
}

async function testClientConnection(clientUrl: string, clientKey: string) {
  const start = Date.now();
  try {
    // Ping Auth Admin API instead of PostgREST
    // This is more reliable for new projects where migrations haven't run yet
    const res = await fetch(`${clientUrl}/auth/v1/admin/users?per_page=1`, {
      method: "GET",
      headers: {
        apikey: clientKey,
        Authorization: `Bearer ${clientKey}`
      }
    });

    const latency = Date.now() - start;

    if (res.ok) {
      return { status: "valid" as const, latency };
    }

    const errText = await res.text();
    return {
      status: "broken" as const,
      latency,
      error: `Erro de Autentica├º├úo/Acesso (${res.status}): ${errText.substring(0, 100)}`
    };
  } catch (e) {
    return {
      status: "broken" as const,
      error: `Erro de Rede/Conectividade: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

async function updateClientHealth(supabaseAdmin: SupabaseClient, clientId: string, health: { status: 'valid' | 'broken', error?: string }) {
  const { error } = await supabaseAdmin
    .from("projetos")
    .update({
      key_status: health.status,
      last_health_check_at: new Date().toISOString(),
      health_error_detail: health.error || null
    })
    .eq("id", clientId);

  if (error) console.error("Erro ao salvar status de saúde no banco Master:", error);
}

async function validateKeyLazy(supabaseAdmin: SupabaseClient, clientId: string, clientUrl: string, clientKey: string, currentStatus?: string, lastCheck?: string | null) {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  const lastCheckTime = lastCheck ? new Date(lastCheck).getTime() : 0;

  // Disparar se status desconhecido ou ├║ltima verifica├º├úo h├í mais de 1 hora
  if (currentStatus === 'unknown' || (now - lastCheckTime) > ONE_HOUR) {
    console.log(`Lazy Validation: Checking tenant ${clientId}...`);
    const health = await testClientConnection(clientUrl, clientKey);
    await updateClientHealth(supabaseAdmin, clientId, health);
    return health;
  }
  
  return { status: currentStatus };
}

async function runSql(projectUrl: string, accessToken: string, sql: string) {
  const projectRef = projectUrl.split(".")[0].split("//")[1];
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Management API error: ${err.message || res.status}`);
  }

  return await res.json();
}

async function testAnonKey(clientUrl: string, anonKey: string): Promise<"ok" | "invalid"> {
  try {
    const res = await fetch(`${clientUrl}/rest/v1/`, {
      method: "GET",
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
    });
    return res.status < 500 ? "ok" : "invalid";
  } catch {
    return "invalid";
  }
}

async function testPAT(clientUrl: string, pat: string): Promise<"ok" | "invalid"> {
  try {
    const ref = new URL(clientUrl).hostname.split(".")[0];
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
      headers: { Authorization: `Bearer ${pat}` }
    });
    return res.ok ? "ok" : "invalid";
  } catch {
    return "invalid";
  }
}

async function healthCheck(
  clientUrl: string,
  serviceRoleKey?: string,
  anonKey?: string,
  pat?: string,
) {
  if (!serviceRoleKey) {
    try {
      const res = await fetch(clientUrl, { method: "OPTIONS" });
      return { status: res.status < 500 ? "online" : "offline", code: res.status };
    } catch (e) {
      return { status: "offline", error: (e as Error).message };
    }
  }

  const health = await testClientConnection(clientUrl, serviceRoleKey);
  const online = health.status === "valid";

  const [anonStatus, patStatus] = await Promise.all([
    anonKey ? testAnonKey(clientUrl, anonKey) : Promise.resolve("unknown" as const),
    pat      ? testPAT(clientUrl, pat)        : Promise.resolve("unknown" as const),
  ]);

  return {
    status: online ? "online" : "offline",
    latency: health.latency,
    error: health.error,
    keys: {
      anon:         anonStatus,
      service_role: online ? "ok" : "invalid",
      pat:          patStatus,
    },
  };
}

async function getReferenceConfig(supabaseAdmin: SupabaseClient, referenceProjectId?: string) {
  const refId = referenceProjectId ?? Deno.env.get("REFERENCE_PROJECT_ID");
  if (!refId) throw new Error("REFERENCE_PROJECT_ID não configurado nos secrets da função");

  const { data: reference, error } = await supabaseAdmin
    .from("projetos")
    .select("id, project_name, supabase_url, supabase_secret_keys, supabase_access_token")
    .eq("id", refId)
    .single();
  if (error || !reference) throw new Error(`Projeto de referência não encontrado (id: ${refId})`);
  return reference;
}

const CANONICAL_AUTH_CONFIG_FIELDS = new Set([
  "site_url",
  "uri_allow_list",
  "mailer_subjects_invite",
  "mailer_templates_invite_content",
  "mailer_subjects_recovery",
  "mailer_templates_recovery_content",
]);

function extractProjectRef(projectUrl: string) {
  return new URL(projectUrl).hostname.split(".")[0];
}

async function fetchProjectAuthConfig(projectUrl: string, accessToken: string) {
  const projectRef = extractProjectRef(projectUrl);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw createHttpError(
      `Management API Error (${projectRef}) [${res.status}]: ${await res.text()}`,
      502,
    );
  }

  return await res.json();
}

async function patchProjectAuthConfig(projectUrl: string, accessToken: string, payload: Record<string, unknown>) {
  const projectRef = extractProjectRef(projectUrl);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw createHttpError(
      `Management API Error (${projectRef}) [${res.status}]: ${await res.text()}`,
      502,
    );
  }

  return await res.json();
}

async function patchEdgeFunction(
  projectRef: string,
  accessToken: string,
  slug: string,
  payload: { verify_jwt?: boolean },
) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions/${slug}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw createHttpError(
      `Management API Error (${projectRef}) [${res.status}]: ${await res.text()}`,
      502,
    );
  }

  return await res.json();
}

async function buildEdgeFunctionSyncPlan(
  supabaseAdmin: SupabaseClient,
  slug: string,
  referenceProjectId?: string,
) {
  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const projectRef = extractProjectRef(refConfig.supabase_url);
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions/${slug}`, {
    headers: { Authorization: `Bearer ${refConfig.supabase_access_token}` },
  });

  if (!res.ok) {
    throw createHttpError(
      `Edge function "${slug}" não encontrada na referência (${res.status})`,
      400,
    );
  }

  const fn = await res.json();
  const payload = { verify_jwt: fn.verify_jwt };

  return {
    payload,
    // Campo `sql` no dry-run contém preview textual de operação via API, não SQL real.
    // Segue a mesma convenção de auth_config para manter o contrato do dry-run uniforme.
    preview: `PATCH /functions/${slug}\n${JSON.stringify(payload, null, 2)}`,
  };
}

async function buildAuthConfigSyncPlan(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  referenceProjectId?: string,
) {
  if (!CANONICAL_AUTH_CONFIG_FIELDS.has(objectName)) {
    throw createHttpError(`Campo auth_config ainda nÃ£o suportado: ${objectName}`, 400);
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referÃªncia ausente", 500);
  }

  const refAuthConfig = await fetchProjectAuthConfig(refConfig.supabase_url, refConfig.supabase_access_token);
  const value = refAuthConfig?.[objectName];

  return {
    payload: { [objectName]: value },
    preview: `PATCH /config/auth\n${JSON.stringify({ [objectName]: value }, null, 2)}`,
  };
}

async function buildViewSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  referenceProjectId?: string,
) {
  assertSafeIdentifier(objectName, "objectName");
  assertSafeIdentifier(schemaName, "schema");

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const schemaLiteral = schemaName.replace(/'/g, "''");
  const objectLiteral = objectName.replace(/'/g, "''");
  const qualified = `${quoteIdentifier(schemaName)}.${quoteIdentifier(objectName)}`;

  const viewRows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT
        pg_get_viewdef(format('%I.%I', '${schemaLiteral}', '${objectLiteral}')::regclass, true) AS definition,
        coalesce(
          EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN LATERAL unnest(coalesce(c.reloptions, ARRAY[]::text[])) AS opt
            WHERE n.nspname = '${schemaLiteral}'
              AND c.relname = '${objectLiteral}'
              AND c.relkind IN ('v','m')
              AND opt = 'security_invoker=true'
          ),
          false
        ) AS security_invoker`
  );

  const definition = viewRows?.[0]?.definition;
  if (!definition) {
    throw createHttpError(`View ${schemaName}.${objectName} não encontrada no Rayssa`, 404);
  }
  const securityInvoker = Boolean(viewRows?.[0]?.security_invoker);
  const grantStatements = [
    `REVOKE ALL ON TABLE ${qualified} FROM ${quoteIdentifier("anon")}, ${quoteIdentifier("authenticated")}, ${quoteIdentifier("service_role")};`,
    `GRANT SELECT ON TABLE ${qualified} TO ${quoteIdentifier("authenticated")};`,
    `GRANT SELECT ON TABLE ${qualified} TO ${quoteIdentifier("service_role")};`,
  ];

  // DROP before CREATE because CREATE OR REPLACE VIEW fails when column order changes.
  // CASCADE is safe for views (no FK constraints reference them).
  return [
    `DROP VIEW IF EXISTS ${qualified} CASCADE;`,
    `CREATE VIEW ${qualified}${securityInvoker ? " WITH (security_invoker = true)" : ""} AS`,
    definition.trim().replace(/;$/, ""),
    ";",
    ...grantStatements,
  ].join("\n");
}

function escapeLiteral(value: string) {
  return value.replace(/'/g, "''");
}

function splitQualifiedObjectName(objectName: string, fieldName: string) {
  const [head, ...tail] = objectName.split(".");
  if (!head || tail.length === 0) {
    throw createHttpError(`${fieldName} inválido`, 400);
  }
  return { head, remainder: tail.join(".") };
}

function splitFunctionSignature(signature: string, fieldName: string) {
  const match = signature.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
  if (!match) {
    throw createHttpError(`${fieldName} invÃ¡lido`, 400);
  }

  return {
    functionName: match[1],
    identityArgs: match[2],
  };
}

function splitFunctionGrantObjectName(objectName: string) {
  const lastDotIndex = objectName.lastIndexOf(".");
  if (lastDotIndex <= 0) {
    throw createHttpError("objectName invÃ¡lido", 400);
  }

  const signature = objectName.slice(0, lastDotIndex);
  const grantee = objectName.slice(lastDotIndex + 1);
  const { functionName, identityArgs } = splitFunctionSignature(signature, "objectName");
  assertSafeIdentifier(grantee, "grantee");

  return { functionName, identityArgs, grantee };
}

function normalizeRoles(roles: unknown): string[] {
  if (Array.isArray(roles)) return roles.map(String);
  if (typeof roles === "string") {
    const trimmed = roles.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .map((value) => value.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

function roleToSql(role: string) {
  return role.toLowerCase() === "public" ? "PUBLIC" : quoteIdentifier(role);
}

async function rewriteTenantSpecificFunctionDefinition(
  client: ClientConfig,
  functionName: string,
  definition: string,
) {
  if (functionName === "update_extension_license") {
    return definition.replace(
      /COALESCE\s*\(\s*p_unit_id\s*,\s*'[^']+'\s*::uuid\s*\)/g,
      `COALESCE(
        p_unit_id,
        (SELECT unit_id FROM public.configuracao_entidade WHERE unit_id IS NOT NULL ORDER BY updated_at DESC NULLS LAST, id ASC LIMIT 1),
        (SELECT unit_id FROM public.entidade WHERE unit_id IS NOT NULL ORDER BY id ASC LIMIT 1),
        (SELECT id FROM public.tenant_units WHERE COALESCE(is_active, true) = true ORDER BY created_at ASC NULLS LAST, id ASC LIMIT 1)
      )`,
    );
  }

  return definition;
}

function isAllowedIsolatedTableGrant(tableName: string, grantee: string) {
  if (SHARED_GOVERNANCE_TABLES.has(tableName)) {
    return false;
  }

  if (grantee === "anon" && !ISOLATED_ANON_TABLE_GRANT_ALLOWLIST.has(tableName)) {
    return false;
  }

  return true;
}

function isAllowedIsolatedFunctionGrant(functionSignature: string, grantee: string) {
  if (grantee === "anon" && !ISOLATED_ANON_FUNCTION_GRANT_ALLOWLIST.has(functionSignature)) {
    return false;
  }

  return true;
}

function getUnsafeIsolatedSyncReason(
  objectType: "view" | "index" | "policy" | "grant" | "auth_config" | "function" | "function_grant" | "trigger",
  objectName: string,
) {
  if (objectType === "grant") {
    const lastDotIndex = objectName.lastIndexOf(".");
    if (lastDotIndex <= 0) return null;

    const tableName = objectName.slice(0, lastDotIndex);
    const grantee = objectName.slice(lastDotIndex + 1);

    if (!isAllowedIsolatedTableGrant(tableName, grantee)) {
      return `Grant bloqueado pelo baseline de segurança para tenants isolated: ${objectName}`;
    }

    return null;
  }

  if (objectType === "function_grant") {
    const { functionName, identityArgs, grantee } = splitFunctionGrantObjectName(objectName);
    const functionSignature = `${functionName}(${identityArgs})`;

    if (!isAllowedIsolatedFunctionGrant(functionSignature, grantee)) {
      return `EXECUTE bloqueado pelo baseline de segurança para tenants isolated: ${functionSignature}.${grantee}`;
    }

    return null;
  }

  return null;
}

async function buildIndexSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { head: tableName, remainder: indexName } = splitQualifiedObjectName(objectName, "objectName");
  assertSafeIdentifier(tableName, "tableName");
  assertSafeIdentifier(indexName, "indexName");

  const qualifiedIndex = `${quoteIdentifier(schemaName)}.${quoteIdentifier(indexName)}`;
  if (diffType === "extra_in_tenant") {
    return `DROP INDEX IF EXISTS ${qualifiedIndex};`;
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT indexdef
     FROM pg_indexes
     WHERE schemaname = '${escapeLiteral(schemaName)}'
       AND tablename = '${escapeLiteral(tableName)}'
       AND indexname = '${escapeLiteral(indexName)}'
     LIMIT 1`
  );

  const definition = rows?.[0]?.indexdef;
  if (!definition) {
    throw createHttpError(`Index ${schemaName}.${tableName}.${indexName} não encontrado no Rayssa`, 404);
  }

  const normalizedDefinition = definition
    .trim()
    .replace(/;$/, "")
    .replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+/i, (_match, uniquePart = "") => {
      return `CREATE ${uniquePart}INDEX IF NOT EXISTS `;
    });

  if (diffType === "missing_in_tenant") {
    return `${normalizedDefinition};`;
  }

  return [
    `DROP INDEX IF EXISTS ${qualifiedIndex};`,
    `${definition.trim().replace(/;$/, "")};`,
  ].join("\n");
}

async function buildPolicySyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { head: tableName, remainder: policyName } = splitQualifiedObjectName(objectName, "objectName");
  assertSafeIdentifier(tableName, "tableName");

  const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
  const dropSql = `DROP POLICY IF EXISTS ${quoteIdentifier(policyName)} ON ${qualifiedTable};`;

  if (diffType === "extra_in_tenant") {
    return dropSql;
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM pg_policies
     WHERE schemaname = '${escapeLiteral(schemaName)}'
       AND tablename = '${escapeLiteral(tableName)}'
       AND policyname = '${escapeLiteral(policyName)}'
     LIMIT 1`
  );

  const policy = rows?.[0];
  if (!policy) {
    throw createHttpError(`Policy ${schemaName}.${tableName}.${policyName} não encontrada no Rayssa`, 404);
  }

  const roles = normalizeRoles(policy.roles);
  const permissive = typeof policy.permissive === "string" ? policy.permissive.toUpperCase() : "PERMISSIVE";
  const cmd = typeof policy.cmd === "string" ? policy.cmd.toUpperCase() : "ALL";

  const createParts = [
    `CREATE POLICY ${quoteIdentifier(policyName)} ON ${qualifiedTable}`,
    `AS ${permissive}`,
    `FOR ${cmd}`,
  ];

  if (roles.length > 0) {
    createParts.push(`TO ${roles.map(roleToSql).join(", ")}`);
  }

  if (policy.qual) {
    createParts.push(`USING (${policy.qual})`);
  }

  if (policy.with_check) {
    createParts.push(`WITH CHECK (${policy.with_check})`);
  }

  return [dropSql, `${createParts.join(" ")};`].join("\n");
}

async function buildGrantSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { head: tableName, remainder: grantee } = splitQualifiedObjectName(objectName, "objectName");
  assertSafeIdentifier(tableName, "tableName");
  assertSafeIdentifier(grantee, "grantee");

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referÃªncia ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT
        c.relkind,
        (
          SELECT string_agg(rtg.privilege_type, ', ' ORDER BY rtg.privilege_type)
          FROM information_schema.role_table_grants rtg
          WHERE rtg.table_schema = '${escapeLiteral(schemaName)}'
            AND rtg.table_name = '${escapeLiteral(tableName)}'
            AND rtg.grantee = '${escapeLiteral(grantee)}'
        ) AS privileges
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${escapeLiteral(schemaName)}'
        AND c.relname = '${escapeLiteral(tableName)}'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      LIMIT 1`,
  );

  const relkind = rows?.[0]?.relkind as string | null | undefined;
  const privileges = rows?.[0]?.privileges as string | null | undefined;
  const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
  const quotedRole = roleToSql(grantee);
  const statements = [`REVOKE ALL ON TABLE ${qualifiedTable} FROM ${quotedRole};`];

  if (relkind === "v" || relkind === "m") {
    if (grantee !== "anon") {
      statements.push(`GRANT SELECT ON TABLE ${qualifiedTable} TO ${quotedRole};`);
    }
    return statements.join("\n");
  }

  if (privileges && privileges.trim().length > 0) {
    statements.push(`GRANT ${privileges} ON TABLE ${qualifiedTable} TO ${quotedRole};`);
  }

  return statements.join("\n");
}

async function buildFunctionSyncSql(
  supabaseAdmin: SupabaseClient,
  client: ClientConfig,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { functionName, identityArgs } = splitFunctionSignature(objectName, "objectName");
  assertSafeIdentifier(functionName, "functionName");

  const qualifiedFunction = `${quoteIdentifier(schemaName)}.${quoteIdentifier(functionName)}(${identityArgs})`;

  if (diffType === "extra_in_tenant") {
    if (!client.supabase_access_token) {
      throw createHttpError("PAT do tenant alvo ausente", 400);
    }
    return await buildExtraFunctionRemovalSql(
      client.supabase_url,
      client.supabase_access_token,
      schemaName,
      objectName,
    );
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referÃªncia ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT pg_get_functiondef(p.oid) AS definition
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${escapeLiteral(schemaName)}'
       AND p.proname = '${escapeLiteral(functionName)}'
       AND pg_get_function_identity_arguments(p.oid) = '${escapeLiteral(identityArgs)}'
     LIMIT 1`,
  );

  const definition = rows?.[0]?.definition as string | null | undefined;
  if (!definition) {
    throw createHttpError(`Function ${schemaName}.${objectName} nÃ£o encontrada no Rayssa`, 404);
  }

  return ensureSqlTerminator(await rewriteTenantSpecificFunctionDefinition(client, functionName, definition));
}

async function buildFunctionGrantSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { functionName, identityArgs, grantee } = splitFunctionGrantObjectName(objectName);
  assertSafeIdentifier(functionName, "functionName");

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referÃªncia ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT has_function_privilege(
              '${escapeLiteral(grantee)}',
              p.oid,
              'EXECUTE'
            ) AS has_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = '${escapeLiteral(schemaName)}'
        AND p.proname = '${escapeLiteral(functionName)}'
        AND pg_get_function_identity_arguments(p.oid) = '${escapeLiteral(identityArgs)}'
      LIMIT 1`,
  );

  const hasExecute = Boolean(rows?.[0]?.has_execute);
  const qualifiedFunction = `${quoteIdentifier(schemaName)}.${quoteIdentifier(functionName)}(${identityArgs})`;
  const quotedRole = roleToSql(grantee);
  const statements: string[] = [];

  if (!hasExecute) {
    statements.push(`REVOKE EXECUTE ON FUNCTION ${qualifiedFunction} FROM PUBLIC;`);
  }

  statements.push(`REVOKE ALL ON FUNCTION ${qualifiedFunction} FROM ${quotedRole};`);

  if (hasExecute) {
    statements.push(`GRANT EXECUTE ON FUNCTION ${qualifiedFunction} TO ${quotedRole};`);
  }

  return statements.join("\n");
}

async function buildFunctionGrantSyncSqlSafe(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { functionName, identityArgs, grantee } = splitFunctionGrantObjectName(objectName);
  assertSafeIdentifier(functionName, "functionName");

  const qualifiedFunction = `${quoteIdentifier(schemaName)}.${quoteIdentifier(functionName)}(${identityArgs})`;
  const quotedRole = roleToSql(grantee);

  if (diffType === "extra_in_tenant") {
    return [
      `REVOKE EXECUTE ON FUNCTION ${qualifiedFunction} FROM PUBLIC;`,
      `REVOKE ALL ON FUNCTION ${qualifiedFunction} FROM ${quotedRole};`,
    ].join("\n");
  }

  return await buildFunctionGrantSyncSql(supabaseAdmin, objectName, schemaName, referenceProjectId);
}

async function buildTriggerSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { head: tableName, remainder: triggerName } = splitQualifiedObjectName(objectName, "objectName");
  assertSafeIdentifier(tableName, "tableName");
  assertSafeIdentifier(triggerName, "triggerName");

  const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
  const dropSql = `DROP TRIGGER IF EXISTS ${quoteIdentifier(triggerName)} ON ${qualifiedTable};`;

  if (diffType === "extra_in_tenant") {
    return dropSql;
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referÃªncia ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT pg_get_triggerdef(tg.oid, true) AS definition
     FROM pg_trigger tg
     JOIN pg_class cls ON cls.oid = tg.tgrelid
     JOIN pg_namespace n ON n.oid = cls.relnamespace
     WHERE n.nspname = '${escapeLiteral(schemaName)}'
       AND cls.relname = '${escapeLiteral(tableName)}'
       AND tg.tgname = '${escapeLiteral(triggerName)}'
       AND NOT tg.tgisinternal
     LIMIT 1`,
  );

  const definition = rows?.[0]?.definition as string | null | undefined;
  if (!definition) {
    throw createHttpError(`Trigger ${schemaName}.${tableName}.${triggerName} nÃ£o encontrada no Rayssa`, 404);
  }

  if (diffType === "different_definition") {
    return [dropSql, `${definition.trim().replace(/;$/, "")};`].join("\n");
  }

  return [dropSql, `${definition.trim().replace(/;$/, "")};`].join("\n");
}

function buildColumnTypeStr(col: {
  data_type: string;
  udt_name: string;
  character_maximum_length?: number | null;
  numeric_precision?: number | null;
  numeric_scale?: number | null;
}): string {
  const dt = col.data_type.toLowerCase();
  if (dt === "character varying" || dt === "varchar") {
    return col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "text";
  }
  if (dt === "numeric" || dt === "decimal") {
    if (col.numeric_precision != null && col.numeric_scale != null) {
      return `numeric(${col.numeric_precision},${col.numeric_scale})`;
    }
    return "numeric";
  }
  if (dt === "array") {
    return `${col.udt_name.replace(/^_/, "")}[]`;
  }
  if (dt === "user-defined") {
    return quoteIdentifier(col.udt_name);
  }
  return dt;
}

async function buildColumnSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { head: tableName, remainder: columnName } = splitQualifiedObjectName(objectName, "objectName");
  assertSafeIdentifier(tableName, "tableName");
  assertSafeIdentifier(columnName, "columnName");

  if (diffType === "extra_in_tenant") {
    throw createHttpError(
      `Remoção automática de colunas não suportada — avalie manualmente: ${schemaName}.${tableName}.${columnName}`,
      400,
    );
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale
     FROM information_schema.columns
     WHERE table_schema = '${escapeLiteral(schemaName)}'
       AND table_name   = '${escapeLiteral(tableName)}'
       AND column_name  = '${escapeLiteral(columnName)}'
     LIMIT 1`,
  );

  const col = rows?.[0];
  if (!col) {
    throw createHttpError(`Column ${schemaName}.${tableName}.${columnName} não encontrada no Rayssa`, 404);
  }

  const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
  const quotedColumn = quoteIdentifier(columnName);

  if (diffType === "missing_in_tenant") {
    const typeStr = buildColumnTypeStr(col);
    const nullableStr = col.is_nullable === "YES" ? "" : " NOT NULL";
    const defaultStr = col.column_default ? ` DEFAULT ${col.column_default}` : "";
    return `ALTER TABLE ${qualifiedTable} ADD COLUMN IF NOT EXISTS ${quotedColumn} ${typeStr}${nullableStr}${defaultStr};`;
  }

  // different_definition: only sync DEFAULT (type changes require manual migration)
  if (col.column_default) {
    return `ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quotedColumn} SET DEFAULT ${col.column_default};`;
  }
  return `ALTER TABLE ${qualifiedTable} ALTER COLUMN ${quotedColumn} DROP DEFAULT;`;
}

async function buildConstraintSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  const { head: tableName, remainder: constraintName } = splitQualifiedObjectName(objectName, "objectName");
  assertSafeIdentifier(tableName, "tableName");

  const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}`;
  const quotedConstraint = quoteIdentifier(constraintName);
  const dropSql = `ALTER TABLE ${qualifiedTable} DROP CONSTRAINT IF EXISTS ${quotedConstraint};`;

  if (diffType === "extra_in_tenant") {
    return dropSql;
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT pg_get_constraintdef(con.oid, true) AS definition
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = '${escapeLiteral(schemaName)}'
       AND rel.relname = '${escapeLiteral(tableName)}'
       AND con.conname = '${escapeLiteral(constraintName)}'
     LIMIT 1`,
  );

  const def = rows?.[0]?.definition as string | null | undefined;
  if (!def) {
    throw createHttpError(`Constraint ${schemaName}.${tableName}.${constraintName} não encontrada no Rayssa`, 404);
  }

  // Phase G guard: FK to user_profiles via user_id is a Phase G migration
  if (def.includes("user_profiles(id)") && constraintName.endsWith("_user_id_fkey")) {
    throw createHttpError(
      `${constraintName} é uma FK da Fase G (→ user_profiles) e não pode ser sincronizada automaticamente`,
      400,
    );
  }

  const addSql = `ALTER TABLE ${qualifiedTable} ADD CONSTRAINT ${quotedConstraint} ${def};`;
  if (diffType === "missing_in_tenant") return addSql;
  return [dropSql, addSql].join("\n");
}

async function buildRlsStateSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  assertSafeIdentifier(objectName, "tableName");
  const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(objectName)}`;

  if (diffType === "extra_in_tenant") {
    throw createHttpError(
      `Desabilitação automática de RLS não suportada — avalie manualmente: ${schemaName}.${objectName}`,
      400,
    );
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = '${escapeLiteral(schemaName)}'
       AND c.relname = '${escapeLiteral(objectName)}'
     LIMIT 1`,
  );

  const row = rows?.[0];
  if (!row) {
    throw createHttpError(`Tabela ${schemaName}.${objectName} não encontrada na referência`, 404);
  }

  const parts: string[] = [];
  if (row.relrowsecurity) {
    parts.push(`ALTER TABLE ${qualifiedTable} ENABLE ROW LEVEL SECURITY;`);
  }
  // Always emit FORCE/NO FORCE explicitly so the target aligns with the reference,
  // including the case where different_definition means the tenant has FORCE=true
  // but the reference has FORCE=false.
  if (row.relforcerowsecurity) {
    parts.push(`ALTER TABLE ${qualifiedTable} FORCE ROW LEVEL SECURITY;`);
  } else if (row.relrowsecurity) {
    parts.push(`ALTER TABLE ${qualifiedTable} NO FORCE ROW LEVEL SECURITY;`);
  }
  return parts.join("\n") || `-- RLS state already aligned for ${objectName}`;
}

async function buildEnumTypeSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  assertSafeIdentifier(objectName, "typeName");

  if (diffType === "extra_in_tenant") {
    throw createHttpError(
      `DROP TYPE automático não suportado — avalie manualmente: ${schemaName}.${objectName}`,
      400,
    );
  }

  if (diffType === "different_definition") {
    throw createHttpError(
      `ALTER TYPE não suportado automaticamente: ${schemaName}.${objectName}. Adicionar valores a um enum é irreversível; remover valores exige DROP+recreate com dados migrados.`,
      400,
    );
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const rows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS vals
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE n.nspname = '${escapeLiteral(schemaName)}'
       AND t.typname = '${escapeLiteral(objectName)}'
       AND t.typtype = 'e'
     GROUP BY t.oid`,
  );

  const vals = rows?.[0]?.vals;
  if (!vals) {
    throw createHttpError(
      `Tipo ${schemaName}.${objectName} não encontrado na referência ou não é um enum (domains não são suportados).`,
      400,
    );
  }

  const quotedVals = vals
    .split(",")
    .map((v: string) => `'${v.replace(/'/g, "''")}'`)
    .join(", ");

  return `CREATE TYPE ${quoteIdentifier(schemaName)}.${quoteIdentifier(objectName)} AS ENUM (${quotedVals});`;
}

function buildExtensionSyncSql(
  objectName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
) {
  assertSafeIdentifier(objectName, "extensionName");

  if (diffType === "extra_in_tenant") {
    throw createHttpError(
      `Remoção automática de extensão não suportada — avalie manualmente: ${objectName}`,
      400,
    );
  }

  if (diffType === "different_definition") {
    throw createHttpError(
      `Atualização de versão de extensão não suportada automaticamente: ${objectName}. Avalie o impacto antes de atualizar manualmente via Dashboard do Supabase.`,
      400,
    );
  }

  if (!EXTENSION_APPLY_ALLOWLIST.has(objectName)) {
    throw createHttpError(
      `Extensão "${objectName}" não está na allowlist de sync automático. Instale manualmente via Dashboard do Supabase se necessário.`,
      400,
    );
  }

  return `CREATE EXTENSION IF NOT EXISTS ${quoteIdentifier(objectName)} WITH SCHEMA public;`;
}

async function buildTableSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  assertSafeIdentifier(schemaName, "schema");
  assertSafeIdentifier(objectName, "tableName");

  if (diffType === "extra_in_tenant") {
    throw createHttpError(
      `DROP TABLE automático não suportado — avalie manualmente: ${schemaName}.${objectName}`,
      400,
    );
  }

  if (diffType === "different_definition") {
    throw createHttpError(
      `Divergências internas de tabela devem ser sincronizadas via columns/constraints: ${schemaName}.${objectName}`,
      400,
    );
  }

  const refConfig = await getReferenceConfig(supabaseAdmin, referenceProjectId);
  if (!refConfig.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const colRows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT column_name, data_type, udt_name, is_nullable, column_default,
            character_maximum_length, numeric_precision, numeric_scale
     FROM information_schema.columns
     WHERE table_schema = '${escapeLiteral(schemaName)}'
       AND table_name   = '${escapeLiteral(objectName)}'
     ORDER BY ordinal_position`,
  );

  if (!colRows || colRows.length === 0) {
    throw createHttpError(`Tabela ${schemaName}.${objectName} não encontrada na referência`, 404);
  }

  const pkRows = await runSql(
    refConfig.supabase_url,
    refConfig.supabase_access_token,
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
     WHERE tc.table_schema = '${escapeLiteral(schemaName)}'
       AND tc.table_name   = '${escapeLiteral(objectName)}'
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
  );

  const pkColumns = (pkRows || []).map((r: any) => r.column_name as string);
  const qualifiedTable = `${quoteIdentifier(schemaName)}.${quoteIdentifier(objectName)}`;

  const columnDefs = colRows.map((col: any) => {
    // Note: standard base types (uuid, jsonb, text, etc.) have data_type = 'uuid',
    // 'jsonb', 'text', etc. — NOT 'user-defined'. Only custom enums and domain types
    // come as 'user-defined'. Those may not exist in the target yet, so we block them.
    if (col.data_type?.toLowerCase() === "user-defined") {
      throw createHttpError(
        `Coluna "${col.column_name}" da tabela "${objectName}" usa tipo USER-DEFINED (${col.udt_name}) — crie o tipo manualmente no tenant antes de sincronizar esta tabela.`,
        400,
      );
    }
    const typeStr = buildColumnTypeStr(col);
    const nullStr = col.is_nullable === "YES" ? "" : " NOT NULL";
    const defaultStr = col.column_default ? ` DEFAULT ${col.column_default}` : "";
    return `  ${quoteIdentifier(col.column_name)} ${typeStr}${nullStr}${defaultStr}`;
  });

  if (pkColumns.length > 0) {
    columnDefs.push(`  PRIMARY KEY (${pkColumns.map((c: string) => quoteIdentifier(c)).join(", ")})`);
  }

  return [`CREATE TABLE IF NOT EXISTS ${qualifiedTable} (`, columnDefs.join(",\n"), `);`].join("\n");
}

async function buildSchemaDriftSql(
  supabaseAdmin: SupabaseClient,
  client: ClientConfig,
  objectType: "view" | "index" | "policy" | "grant" | "function" | "function_grant" | "trigger" | "column" | "constraint" | "rls_state" | "extensions" | "table" | "enum_type",
  objectName: string,
  schemaName: string,
  diffType: "missing_in_tenant" | "extra_in_tenant" | "different_definition",
  referenceProjectId?: string,
) {
  if (objectType === "view") {
    if (diffType === "extra_in_tenant") {
      throw createHttpError("Views extras ainda não são suportadas pelo sync assistido", 400);
    }
    return await buildViewSyncSql(supabaseAdmin, objectName, schemaName, referenceProjectId);
  }

  if (objectType === "index") {
    return await buildIndexSyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "grant") {
    return await buildGrantSyncSql(supabaseAdmin, objectName, schemaName, referenceProjectId);
  }

  if (objectType === "function") {
    return await buildFunctionSyncSql(supabaseAdmin, client, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "function_grant") {
    return await buildFunctionGrantSyncSqlSafe(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "trigger") {
    return await buildTriggerSyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "column") {
    return await buildColumnSyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "constraint") {
    return await buildConstraintSyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "rls_state") {
    return await buildRlsStateSyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "extensions") {
    return buildExtensionSyncSql(objectName, diffType);
  }

  if (objectType === "enum_type") {
    return buildEnumTypeSyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  if (objectType === "table") {
    return await buildTableSyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
  }

  return await buildPolicySyncSql(supabaseAdmin, objectName, schemaName, diffType, referenceProjectId);
}

async function applySchemaDriftBatch(
  clientId: string,
  client: ClientConfig,
  supabaseAdmin: SupabaseClient,
  params: ApplySchemaDriftBatchParams,
  referenceProjectId?: string,
) {
  const { operations, mode } = params;

  if (clientId === (await getReferenceConfig(supabaseAdmin, referenceProjectId)).id) {
    throw createHttpError("O projeto de referência não pode ser sincronizado contra ele mesmo", 400);
  }

  if (!client.supabase_access_token) {
    throw createHttpError(`PAT ausente para o tenant ${clientId}`, 400);
  }

  if (!Array.isArray(operations) || operations.length === 0) {
    throw createHttpError("operations nÃ£o pode ser vazio", 400);
  }

  if (mode !== "dry-run" && mode !== "apply") {
    throw createHttpError("Modo invÃ¡lido", 400);
  }

  // Sort operations by dependency order: columns/tables must precede views/functions
  // that may reference newly added columns, and extensions/enums must precede tables.
  const BATCH_PRIORITY: Record<string, number> = {
    extensions: 0,
    enum_type: 1,
    table: 2,
    column: 3,
    constraint: 4,
    function: 5,
    trigger: 6,
    view: 7,
    policy: 8,
    rls_state: 9,
    index: 10,
    grant: 11,
    function_grant: 12,
  };
  const sortedOperations = [...operations].sort(
    (a, b) => (BATCH_PRIORITY[a.objectType] ?? 99) - (BATCH_PRIORITY[b.objectType] ?? 99),
  );

  const sqlParts: string[] = [];
  const seenPublicFunctionRevokes = new Set<string>();

  for (const operation of sortedOperations) {
    const { objectType, objectName, schema = "public", diffType } = operation;

    if (objectType === "auth_config") {
      throw createHttpError("auth_config ainda nÃ£o pode ser processado em lote", 400);
    }

    if (objectType === "edge_functions") {
      throw createHttpError("edge_functions não pode ser processado em lote — aplique individualmente", 400);
    }

    if (!["view", "index", "policy", "grant", "function", "function_grant", "trigger", "column", "constraint", "rls_state", "extensions", "table", "enum_type"].includes(objectType)) {
      throw createHttpError(`Tipo de objeto ainda não suportado em lote: ${objectType}`, 400);
    }

    if (!["missing_in_tenant", "extra_in_tenant", "different_definition"].includes(diffType)) {
      throw createHttpError("Tipo de divergÃªncia invÃ¡lido", 400);
    }

    const unsafeReason = getUnsafeIsolatedSyncReason(objectType, objectName);
    if (unsafeReason) {
      throw createHttpError(unsafeReason, 400);
    }

    const sql = await buildSchemaDriftSql(
      supabaseAdmin,
      client,
      objectType,
      objectName,
      schema,
      diffType,
      referenceProjectId,
    );

    const normalizedSql = ensureSqlTerminator(sql)
      .trim()
      .split("\n")
      .filter((line) => {
        const trimmedLine = line.trim();
        const isPublicFunctionRevoke =
          /^REVOKE EXECUTE ON FUNCTION .+ FROM PUBLIC;$/i.test(trimmedLine);

        if (!isPublicFunctionRevoke) {
          return true;
        }

        if (seenPublicFunctionRevokes.has(trimmedLine)) {
          return false;
        }

        seenPublicFunctionRevokes.add(trimmedLine);
        return true;
      })
      .join("\n")
      .trim();

    if (normalizedSql.length > 0) {
      sqlParts.push(normalizedSql);
    }
  }

  const combinedSql = sqlParts.join("\n\n");

  if (mode === "dry-run") {
    return {
      success: true,
      mode,
      operationCount: operations.length,
      sql: combinedSql,
    };
  }

  try {
    await runSql(client.supabase_url, client.supabase_access_token, combinedSql);
    return {
      success: true,
      mode,
      operationCount: operations.length,
      sql: combinedSql,
      appliedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createHttpError(`Falha ao sincronizar lote de ${operations.length} operaÃ§Ãµes: ${message}`, 400);
  }
}

async function applySchemaDrift(
  clientId: string,
  client: ClientConfig,
  supabaseAdmin: SupabaseClient,
  params: Record<string, unknown>,
) {
  const referenceProjectId = typeof params.referenceProjectId === "string" ? params.referenceProjectId : undefined;

  if (Array.isArray(params.operations)) {
    return await applySchemaDriftBatch(
      clientId,
      client,
      supabaseAdmin,
      params as unknown as ApplySchemaDriftBatchParams,
      referenceProjectId,
    );
  }

  const { objectType, objectName, schema = "public", mode, diffType } = params as ApplySchemaDriftParams;

  if (clientId === (await getReferenceConfig(supabaseAdmin, referenceProjectId)).id) {
    throw createHttpError("O projeto de referência não pode ser sincronizado contra ele mesmo", 400);
  }

  if (!client.supabase_access_token) {
    throw createHttpError(`PAT ausente para o tenant ${clientId}`, 400);
  }

  if (!["view", "index", "policy", "grant", "auth_config", "function", "function_grant", "trigger", "column", "constraint", "rls_state", "extensions", "table", "enum_type", "edge_functions"].includes(objectType)) {
    throw createHttpError(`Tipo de objeto ainda não suportado: ${objectType}`, 400);
  }

  if (mode !== "dry-run" && mode !== "apply") {
    throw createHttpError("Modo inválido", 400);
  }

  if (!["missing_in_tenant", "extra_in_tenant", "different_definition"].includes(diffType)) {
    throw createHttpError("Tipo de divergÃªncia invÃ¡lido", 400);
  }

  const unsafeReason = getUnsafeIsolatedSyncReason(objectType, objectName);
  if (unsafeReason) {
    throw createHttpError(unsafeReason, 400);
  }

  if (objectType === "auth_config") {
    const plan = await buildAuthConfigSyncPlan(supabaseAdmin, objectName, referenceProjectId);

    if (mode === "dry-run") {
      return { success: true, mode, objectType, objectName, schema, diffType, sql: plan.preview };
    }

    try {
      await patchProjectAuthConfig(client.supabase_url, client.supabase_access_token, plan.payload);
      return {
        success: true,
        mode,
        objectType,
        objectName,
        schema,
        diffType,
        sql: plan.preview,
        appliedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw createHttpError(`Falha ao sincronizar auth_config.${objectName}: ${message}`, 400);
    }
  }

  if (objectType === "edge_functions") {
    if (diffType !== "different_definition") {
      throw createHttpError("Apenas different_definition é suportado para edge_functions — missing/extra envolvem deploy de código", 400);
    }
    const plan = await buildEdgeFunctionSyncPlan(supabaseAdmin, objectName, referenceProjectId);

    if (mode === "dry-run") {
      return { success: true, mode, objectType, objectName, schema, diffType, sql: plan.preview };
    }

    try {
      const tRef = extractProjectRef(client.supabase_url);
      await patchEdgeFunction(tRef, client.supabase_access_token, objectName, plan.payload);
      return {
        success: true,
        mode,
        objectType,
        objectName,
        schema,
        diffType,
        sql: plan.preview,
        appliedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw createHttpError(`Falha ao sincronizar edge_function.${objectName}: ${message}`, 400);
    }
  }

  const sql = await buildSchemaDriftSql(
    supabaseAdmin,
    client,
    objectType,
    objectName,
    schema,
    diffType,
    referenceProjectId,
  );

  if (mode === "dry-run") {
    return { success: true, mode, objectType, objectName, schema, diffType, sql };
  }

  try {
    await runSql(client.supabase_url, client.supabase_access_token, sql);
    return {
      success: true,
      mode,
      objectType,
      objectName,
      schema,
      diffType,
      sql,
      appliedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createHttpError(`Falha ao sincronizar ${schema}.${objectName}: ${message}`, 400);
  }
}


/**
 * Handle direct SQL execute (e.g. Seed)
 */
async function executeRawSql(projectUrl: string, accessToken: string, sql: string) {
  const projectRef = projectUrl.split(".")[0].split("//")[1];
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  return res.ok;
}

async function processDataImport(
  tenantId: string,
  tableName: string,
  data: any[],
  supabaseAdmin: SupabaseClient
) {
  // 1. Register import start in Admin
  const { data: importRecord, error: startError } = await supabaseAdmin
    .from('data_imports')
    .insert({
      tenant_id: tenantId,
      tabela: tableName,
      status: 'processing',
      total_registros: data.length
    })
    .select()
    .single();

  if (startError) throw startError;

  try {
    const client = await getClientConfig(supabaseAdmin, tenantId);
    const tenantClient = createClient(client.supabase_url, client.supabase_secret_keys);
    
    const { data: result, error: importError } = await tenantClient.rpc('process_data_import', {
      p_table_name: tableName,
      p_data: data
    });

    if (importError) throw importError;

    await supabaseAdmin
      .from('data_imports')
      .update({
        status: result.success ? 'completed' : 'failed',
        erro_detalhe: result.success ? null : (result.error || "Erro desconhecido")
      })
      .eq('id', importRecord.id);

    return result;
  } catch (err) {
    await supabaseAdmin
      .from('data_imports')
      .update({
        status: 'failed',
        erro_detalhe: err instanceof Error ? err.message : String(err)
      })
      .eq('id', importRecord.id);
    throw err;
  }
}

async function syncLicenseConfig(
  clientUrl: string,
  clientKey: string,
  limits: { acesso_expira_em: string | null, max_socios: number | null }
) {
  const configUpdates: Record<string, unknown> = {};
  if (limits.max_socios !== null) configUpdates.max_socios = limits.max_socios;
  if (limits.acesso_expira_em !== null) configUpdates.acesso_expira_em = limits.acesso_expira_em;

  if (Object.keys(configUpdates).length === 0) {
    return { success: true, skipped: true, reason: "No license fields to sync" };
  }

  const tenantRes = await fetch(`${clientUrl}/rest/v1/tenants?select=id&limit=2`, {
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
    },
  });

  if (!tenantRes.ok) {
    throw new Error(`Failed to query runtime tenants (${tenantRes.status}): ${await tenantRes.text()}`);
  }

  const runtimeTenants = await tenantRes.json() as Array<{ id?: string | null }>;
  if (runtimeTenants.length === 0 || !runtimeTenants[0]?.id) {
    throw new Error("Runtime tenant not found for license sync.");
  }
  if (runtimeTenants.length > 1) {
    throw new Error("Projeto possui mais de um tenant runtime; sincronização isolated exige tenant explícito.");
  }

  const patchRes = await fetch(`${clientUrl}/rest/v1/tenants?id=eq.${runtimeTenants[0].id}`, {
    method: "PATCH",
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(configUpdates)
  });

  if (!patchRes.ok) {
    throw new Error(`Failed to sync tenant license (${patchRes.status}): ${await patchRes.text()}`);
  }

  return { success: true, updated: configUpdates };
}

async function syncTrialLimits(
  clientUrl: string,
  clientKey: string,
  acessoExpiraEm: string | null,
  maxSocios: number | null
) {
  return await syncLicenseConfig(clientUrl, clientKey, {
    acesso_expira_em: acessoExpiraEm,
    max_socios: maxSocios
  });
}

async function repairAuthMetadata(clientUrl: string, clientKey: string, authUsers: AuthUser[], publicUsers: PublicUser[], adminIds: Set<string>) {
  const supabase = createClient(clientUrl, clientKey);
  let repairedCount = 0;
  for (const u of authUsers) {
    const isActuallyAdmin = adminIds.has(u.id) || u.app_metadata?.role === 'admin';
    const finalRole = isActuallyAdmin ? 'admin' : (u.app_metadata?.role || 'user');
    
    const hasRole = u.app_metadata?.role === finalRole;
    const hasLegacy = 'is_admin' in (u.app_metadata || {});
    
    // Healing logic: If public table says active but Auth has ban_duration, clear it
    const publicUser = publicUsers.find(p => p.id === u.id);
    const shouldUnban = publicUser?.ativo === true && (u.ban_duration && u.ban_duration !== 'none');

    if (!hasRole || hasLegacy || shouldUnban) {
      await supabase.auth.admin.updateUserById(u.id, {
        app_metadata: { role: finalRole },
        user_metadata: { role: finalRole },
        ...(shouldUnban ? { ban_duration: 'none' } : {})
      });
      repairedCount++;
    }
  }
  return repairedCount;
}

async function repairUserSync(clientUrl: string, clientKey: string) {
  // 1. Fetch all Auth users from client with higher limit
  const authRes = await fetch(`${clientUrl}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
  });
  if (!authRes.ok) throw new Error(`Auth API error: ${await authRes.text()}`);
  const authData = await authRes.json();
  const authUsers = authData.users || [];

  // 2. Fetch public.User to identify existing roles/admins (Specced 2nd fetch)
  const publicRes = await fetch(`${clientUrl}/rest/v1/User?select=id,role,ativo`, {
    headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
  });
  
  let adminIds = new Set<string>();
  let publicUsers: PublicUser[] = [];
  if (publicRes.ok) {
    publicUsers = await publicRes.json();
    adminIds = new Set(publicUsers.filter((u: PublicUser) => u.role === 'admin').map((u: PublicUser) => u.id));
  }

  // 3. Bulk UPSERT into public.User (Sanitized: Identity & Role & Active)
  const upsertPayload = authUsers.map((u: AuthUser) => {
    const isBanned = u.ban_duration && u.ban_duration !== 'none';
    const existing = publicUsers.find((p: PublicUser) => p.id === u.id);
    
    return {
      id: u.id,
      email: u.email,
      // Role is admin if it was already admin in public OR if metadata says so
      role: (adminIds.has(u.id) || u.app_metadata?.role === 'admin') ? 'admin' : 'user',
      // Healing: If it exists in public, trust public.ativo (so manual "Unban" button works)
      // If it's new, use Auth !isBanned
      ativo: existing ? existing.ativo : !isBanned
    };
  });

  const upsertRes = await fetch(`${clientUrl}/rest/v1/User`, {
    method: "POST",
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates"
    },
    body: JSON.stringify(upsertPayload)
  });
  
  if (!upsertRes.ok) {
    throw new Error(`Bulk UPSERT failed: ${await upsertRes.text()}`);
  }

  // 4. Repair Auth Metadata: CLEANUP is_admin AND set role AND heal ban_duration
  const repairedCount = await repairAuthMetadata(clientUrl, clientKey, authUsers, publicUsers, adminIds);

  return { 
    success: true, 
    totalProcessed: authUsers.length,
    repairedAuthMetadata: repairedCount
  };
}

// Helper to handle client-side actions securely
async function performAction(action: string, clientUrl: string, clientKey: string, params?: Record<string, unknown>) {
  if (!clientUrl || !clientKey) {
    throw new Error("Client URL or Key is missing. Verify the database entry.");
  }

  switch (action) {
    case "list-users": return await listUsers(clientUrl, clientKey);
    case "list-client-members": return await listClientMembers(clientUrl, clientKey);
    case "create-client-member": return await createClientUser(clientUrl, clientKey, params);
    case "update-client-member": return await updateClientMember(clientUrl, clientKey, params);
    case "list-tables": return await listTables(clientUrl, clientKey);
    case "list-buckets": return await listBuckets(clientUrl, clientKey);
    case "health-check": throw new Error("health-check must be handled in handleAction");
    case "delete-client-member": 
      return await deleteClientUser(clientUrl, clientKey, params?.userId as string);
    case "ban-client-member":
      return await banClientUser(clientUrl, clientKey, params?.userId as string, params?.active as boolean);
    case "repair-user-sync": return await repairUserSync(clientUrl, clientKey);
    case "sync-trial-limits":
      // Routed via handleLimitActions which has access to client record (acesso_expira_em, max_socios)
      throw new Error("sync-trial-limits must be handled in handleLimitActions");
    case "execute-raw-sql": // New: For seeds or maintenance
      if (!params?.sql) throw new Error("Missing SQL");
      return await executeRawSql(clientUrl, params.supabase_access_token as string, params.sql as string);
    default: throw new Error(`Invalid action: ${action}`);
  }
}

async function getRuntimeTenantId(
  supabaseAdmin: SupabaseClient,
  projectId: string,
  clientUrl: string,
  clientKey: string,
) {
  const runtimeAdmin = createClient(clientUrl, clientKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [{ data: runtimeTenants, error: tenantsError }, { data: runtimeUnits, error: unitsError }] =
    await Promise.all([
      runtimeAdmin
        .from("tenants")
        .select("id, supports_units")
        .order("created_at", { ascending: true }),
      runtimeAdmin
        .from("tenant_units")
        .select("tenant_id")
        .eq("is_active", true),
    ]);

  if (tenantsError) throw tenantsError;
  if (unitsError) throw unitsError;

  const tenants = (runtimeTenants ?? []) as Array<{ id: string; supports_units?: boolean | null }>;
  if (tenants.length === 0) throw new Error("No tenant row found in runtime DB");

  const activeUnitCounts = new Map<string, number>();
  for (const row of (runtimeUnits ?? []) as Array<{ tenant_id: string | null }>) {
    if (!row.tenant_id) continue;
    activeUnitCounts.set(row.tenant_id, (activeUnitCounts.get(row.tenant_id) ?? 0) + 1);
  }

  const runtimeTenantsCount = tenants.length;
  const runtimeTenantId = runtimeTenantsCount === 1 ? tenants[0].id : null;
  const perTenantSupportsUnits = tenants.map((tenant) => ({
    id: tenant.id,
    supports_units: Boolean(tenant.supports_units),
    active_units_count: activeUnitCounts.get(tenant.id) ?? 0,
  }));

  const allSupportUnits = perTenantSupportsUnits.every((tenant) => tenant.supports_units);
  const anySupportUnits = perTenantSupportsUnits.some((tenant) => tenant.supports_units);
  const allSingleUnit = perTenantSupportsUnits.every((tenant) => tenant.active_units_count <= 1);

  let runtimeTopology: string | null = null;
  if (runtimeTenantsCount === 1) {
    runtimeTopology = perTenantSupportsUnits[0].supports_units ? "isolated_polo" : "isolated_single";
  } else if (!anySupportUnits && allSingleUnit) {
    runtimeTopology = "shared_multi_single";
  } else if (allSupportUnits) {
    runtimeTopology = "shared_multi_polo";
  } else {
    runtimeTopology = "shared_hybrid";
  }

  const runtimeUnitsCount = perTenantSupportsUnits.reduce((sum, tenant) => sum + tenant.active_units_count, 0);

  if (runtimeTenantId) {
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({
        runtime_tenant_id: runtimeTenantId,
        runtime_topology: runtimeTopology,
        runtime_tenants_count: runtimeTenantsCount,
        runtime_units_count: runtimeUnitsCount,
        supports_units: perTenantSupportsUnits[0].supports_units,
      })
      .eq("project_id", projectId);

    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin
      .from("tenants")
      .update({
        runtime_topology: runtimeTopology,
        runtime_tenants_count: runtimeTenantsCount,
        runtime_units_count: runtimeUnitsCount,
      })
      .eq("project_id", projectId);

    if (error) throw error;
  }

  return {
    runtime_tenant_id: runtimeTenantId,
    runtime_tenants_count: runtimeTenantsCount,
    runtime_units_count: runtimeUnitsCount,
    supports_units: runtimeTenantsCount === 1 ? perTenantSupportsUnits[0].supports_units : anySupportUnits,
    runtime_topology: runtimeTopology,
  };
}

interface ClientConfig {
  supabase_url: string;
  supabase_secret_keys?: string;
  supabase_access_token?: string;
  supabase_publishable_key?: string;
  acesso_expira_em?: string | null;
  max_socios?: number | null;
  key_status?: string;
  last_health_check_at?: string | null;
  tenant_code?: string;
}

interface ApplySchemaDriftParams {
  objectType: 'view' | 'index' | 'policy' | 'grant' | 'auth_config' | 'function' | 'function_grant' | 'trigger' | 'column' | 'constraint';
  objectName: string;
  schema?: string;
  diffType: 'missing_in_tenant' | 'extra_in_tenant' | 'different_definition';
  mode: 'dry-run' | 'apply';
}

interface ApplySchemaDriftOperation {
  objectType: 'view' | 'index' | 'policy' | 'grant' | 'auth_config' | 'function' | 'function_grant' | 'trigger' | 'column' | 'constraint';
  objectName: string;
  schema?: string;
  diffType: 'missing_in_tenant' | 'extra_in_tenant' | 'different_definition';
}

interface ApplySchemaDriftBatchParams {
  operations: ApplySchemaDriftOperation[];
  mode: 'dry-run' | 'apply';
}

function assertSafeIdentifier(value: string, fieldName: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw createHttpError(`${fieldName} inválido`, 400);
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function ensureSqlTerminator(sql: string) {
  const trimmed = sql.trimEnd();
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
}

async function buildExtraFunctionRemovalSql(
  projectUrl: string,
  accessToken: string,
  schemaName: string,
  objectName: string,
) {
  const { functionName, identityArgs } = splitFunctionSignature(objectName, "objectName");
  assertSafeIdentifier(schemaName, "schema");
  assertSafeIdentifier(functionName, "functionName");

  const qualifiedFunction = `${quoteIdentifier(schemaName)}.${quoteIdentifier(functionName)}(${identityArgs})`;
  const rows = await runSql(
    projectUrl,
    accessToken,
    `SELECT e.evtname
     FROM pg_event_trigger e
     JOIN pg_proc p ON p.oid = e.evtfoid
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '${escapeLiteral(schemaName)}'
       AND p.proname = '${escapeLiteral(functionName)}'
       AND pg_get_function_identity_arguments(p.oid) = '${escapeLiteral(identityArgs)}'
     ORDER BY e.evtname`,
  );

  const eventTriggerDrops = (rows ?? []).map((row: { evtname?: string }) =>
    `DROP EVENT TRIGGER IF EXISTS ${quoteIdentifier(String(row.evtname ?? ""))};`,
  );

  return [...eventTriggerDrops, `DROP FUNCTION IF EXISTS ${qualifiedFunction};`].join("\n");
}

async function handleMigrationActions(action: string, clientId: string, client: ClientConfig, supabaseAdmin: SupabaseClient, params: Record<string, unknown>) {
  if (action === "process-data-import") {
    const { tableName, data } = params as { tableName: string, data: any[] };
    if (!tableName || !data) throw new Error("Missing tableName or data for import");
    return await processDataImport(clientId, tableName, data, supabaseAdmin);
  }

  if (action === "apply-schema-drift") {
    return await applySchemaDrift(clientId, client, supabaseAdmin, params);
  }
  return null;
}

async function handleLimitActions(action: string, clientId: string, client: ClientConfig) {
  if (!client.supabase_secret_keys) {
    throw new Error(`Service role key not configured for client ${clientId}`);
  }

  if (action === "sync-trial-limits") {
    console.log(`Syncing trial limits: Expira=${client.acesso_expira_em}, Max=${client.max_socios}`);
    return await syncTrialLimits(
      client.supabase_url,
      client.supabase_secret_keys,
      client.acesso_expira_em ?? null,
      client.max_socios ?? null
    );
  }

  if (action === "repair-user-sync") {
    return await repairUserSync(client.supabase_url, client.supabase_secret_keys);
  }
  return null;
}

async function handleAction(clientId: string, action: string, params: Record<string, unknown>, client: ClientConfig, supabaseAdmin: SupabaseClient) {
  // Pre-check: Lazy validation for all actions that use the secret key
  if (client.supabase_secret_keys) {
    const health = await validateKeyLazy(
      supabaseAdmin, 
      clientId, 
      client.supabase_url, 
      client.supabase_secret_keys, 
      client.key_status, 
      client.last_health_check_at
    );

    if (health.status === 'broken' && action !== 'health-check' && action !== 'apply-schema-drift') {
      throw new Error("Conex├úo com o inquilino interrompida (Service Role Key Inv├ílida). Verifique as configura├º├Áes.");
    }
  }

  if (action === "health-check") {
    return await healthCheck(
      client.supabase_url,
      client.supabase_secret_keys,
      client.supabase_publishable_key,
      client.supabase_access_token,
    );
  }

  if (action === "get-runtime-tenant-id") {
    if (!client.supabase_secret_keys) {
      throw createHttpError(`Service role key missing for project ${clientId}`, 400);
    }
    return await getRuntimeTenantId(supabaseAdmin, clientId, client.supabase_url, client.supabase_secret_keys);
  }

  const migrationResult = await handleMigrationActions(action, clientId, client, supabaseAdmin, params);
  if (migrationResult !== null) return migrationResult;

  const limitResult = await handleLimitActions(action, clientId, client);
  if (limitResult !== null) return limitResult;

  if (!client.supabase_secret_keys) {
    throw new Error(`Service role key missing for action ${action}`);
  }

  // Handle user creation with injected limits
  if (action === "create-client-member") {
    return await createClientUser(client.supabase_url, client.supabase_secret_keys, params, {
      acesso_expira_em: client.acesso_expira_em ?? null,
      max_socios: client.max_socios ?? null
    }, client.tenant_code ?? undefined);
  }

  return await performAction(action, client.supabase_url, client.supabase_secret_keys, params);
}

Deno.serve(async (req: Request) => {
  console.log(`[PROXY_LOG] Request: ${req.method} | Path: ${new URL(req.url).pathname}`);
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseKey) {
      console.error("[PROXY_LOG] CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in environment");
      throw createHttpError("Internal configuration error: missing env vars", 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // 2. Validate Admin Session (Reduced Cognitive Complexity)
    const activeUser = await validateAdminSession(req, supabaseAdmin);
    
    const body = await req.json().catch(() => ({}));
    console.log(`[PROXY_LOG] Body received:`, JSON.stringify(body));
    const { clientId, action, params = {} } = body;

    if (!clientId || !action) {
      throw createHttpError("Missing clientId or action in request body", 400);
    }

    // 3. Fetch Client Config
    const client = await getClientConfig(supabaseAdmin, clientId);

    console.log(`Proxy (${activeUser.email}): ${action} -> Client: ${clientId}`);

    const result = await handleAction(clientId, action, params, client, supabaseAdmin);
    console.log(`Action ${action} result: Success`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    return handleError(err);
  }
});

async function validateAdminSession(req: Request, supabase: SupabaseClient) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.error("DEBUG: Missing Authorization header");
    throw createHttpError("Missing Authorization header", 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error("DEBUG: Auth error or user not found:", authError);
    throw createHttpError("Unauthorized access to proxy: Invalid or expired token", 401);
  }

  if (user.app_metadata?.role !== 'admin') {
    console.error(`Forbidden: User ${user.email} attempted admin action without proper role. Role: ${user.app_metadata?.role}`);
    throw createHttpError("Forbidden: Admin access required", 403);
  }

  return user;
}

async function getClientConfig(supabase: SupabaseClient, clientId: string) {
  console.log(`DEBUG: Fetching config for project ${clientId}...`);
  const { data: projeto, error } = await supabase
    .from("projetos")
    .select("supabase_url, supabase_secret_keys, supabase_access_token, supabase_publishable_key, key_status, last_health_check_at, topology")
    .eq("id", clientId)
    .single();

  if (error || !projeto) {
    console.error(`DEBUG: Error fetching project config: ${error?.message}`);
    throw createHttpError(`Project reach error: ${error?.message || "Not found"}`, 404);
  }

  // Campos comerciais + tenant_code: só válidos para projetos isolated (1 tenant exato).
  // Para shared, actions que dependem de limites (sync-trial-limits) devem receber clienteId explícito.
  let acesso_expira_em: string | null = null;
  let max_socios: number | null = null;
  let tenant_code: string | undefined = undefined;

  const topology = (projeto as any).topology as string ?? "";
  if (!topology.startsWith("shared")) {
    const { data: tenants, error: cErr } = await supabase
      .from("tenants")
      .select("acesso_expira_em, max_socios, tenant_code")
      .eq("project_id", clientId)
      .limit(2);

    if (!cErr && Array.isArray(tenants)) {
      if (tenants.length > 1) {
        throw createHttpError(
          `Projeto ${clientId} tem ${tenants.length} tenants — informe clienteId explícito para actions que dependem de limites comerciais.`,
          400,
        );
      }
      acesso_expira_em = tenants[0]?.acesso_expira_em ?? null;
      max_socios = tenants[0]?.max_socios ?? null;
      tenant_code = tenants[0]?.tenant_code ?? undefined;
    }
  }

  return {
    supabase_url: projeto.supabase_url,
    supabase_secret_keys: projeto.supabase_secret_keys,
    supabase_access_token: projeto.supabase_access_token,
    supabase_publishable_key: projeto.supabase_publishable_key,
    key_status: projeto.key_status,
    last_health_check_at: projeto.last_health_check_at,
    tenant_code,
    acesso_expira_em,
    max_socios,
  };
}

function handleError(err: unknown) {
  let errorMessage = "Erro desconhecido";
  let status = 500;
  let stack = "";

  if (err && typeof err === 'object') {
    const errorObj = err as Record<string, unknown>;
    if (typeof errorObj.status === 'number') status = errorObj.status;
    if (typeof errorObj.message === 'string') errorMessage = errorObj.message;
    if (err instanceof Error) stack = err.stack || "";
  } else if (err instanceof Error) {
    errorMessage = err.message;
    stack = err.stack || "";
  } else if (typeof err === 'string') {
    errorMessage = err;
  }

  console.error(`Critical Proxy Error [${status}]:`, errorMessage);
  if (stack) console.error("Stack:", stack);
  
  return new Response(JSON.stringify({ error: errorMessage, details: stack }), {
    status: status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function createHttpError(message: string, status: number) {
  const err = new Error(message);
  Object.assign(err, { status });
  return err;
}
