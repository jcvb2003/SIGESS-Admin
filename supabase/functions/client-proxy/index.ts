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
  acesso_expira_em: string | null;
  max_socios: number | null;
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

  // 2. Fetch from public.User and public.configuracao_entidade
  let publicUsers: PublicUser[] = [];
  let configData: { max_socios: number | null } | null = null;
  try {
    const [userRes, configRes] = await Promise.all([
      fetch(`${clientUrl}/rest/v1/User?select=id,acesso_expira_em,role,ativo`, {
        headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
      }),
      fetch(`${clientUrl}/rest/v1/configuracao_entidade?select=max_socios&limit=1`, {
        headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
      })
    ]);

    if (userRes.ok) publicUsers = await userRes.json();
    if (configRes.ok) {
      const configArr = await configRes.json();
      configData = configArr[0] || null;
    }
  } catch (e) {
    console.error("Failed to fetch client data:", e);
  }

  const safePublicUsers = Array.isArray(publicUsers) ? publicUsers : [];

  if (authUsers.length > 0) {
    console.log("DEBUG: First user auth data:", JSON.stringify(authUsers[0]));
    const foundPublic = safePublicUsers.find((p: PublicUser) => p.id === authUsers[0].id);
    console.log("DEBUG: First user public data:", JSON.stringify(foundPublic));
  }

  // 3. Merge including app_metadata and role
  const merged: MergedMember[] = authUsers.map((au: AuthUser) => {
    const pu = safePublicUsers.find((p: PublicUser) => p.id === au.id);

    // Auth metadata is source of truth for role (Canon for SIGESS)
    const roleFromMetadata = au.app_metadata?.role;
    const isAdmin = roleFromMetadata === 'admin' || au.app_metadata?.is_admin === true;
    
    // Auth wins: if Auth says admin, it's admin — public.User is just a cache
    const finalRole = isAdmin ? 'admin' : (roleFromMetadata || pu?.role || 'user');

    // Use banned_until from Auth to determine active status (not pu.ativo which can be stale)
    const bannedUntilRaw = (au as any).banned_until;
    const bannedUntil = (bannedUntilRaw && bannedUntilRaw !== '') ? new Date(bannedUntilRaw) : null;
    const isAtivo = !(bannedUntil && bannedUntil > new Date());

    return {
      ...au,
      isAdmin: finalRole === 'admin',
      role: finalRole,
      ativo: isAtivo,
      acesso_expira_em: pu?.acesso_expira_em || null,
      max_socios: configData?.max_socios || null,
      // Metadata check for UI warning if legacy
      hasLegacyMetadata: !!au.app_metadata?.is_admin
    } as MergedMember;
  });

  // 4. SELF-HEALING: If we detect users that are 'Inativo' but NOT banned, fix them in background
  const inconsistents = merged.filter((u: MergedMember) => u.ativo === false && (!u.ban_duration || u.ban_duration === 'none'));
  if (inconsistents.length > 0) {
    console.log(`Self-healing: fixing ${inconsistents.length} users with inconsistent status...`);
    fetch(`${clientUrl}/rest/v1/User?ativo=not.is.true`, {
      method: "PATCH",
      headers: {
        apikey: clientKey,
        Authorization: `Bearer ${clientKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ativo: true })
    }).catch(e => console.error("Self-healing failed:", e));

    // Update the returned objects immediately for the UI
    inconsistents.forEach((u: MergedMember) => {
      u.ativo = true;
    });
  }

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

  // 2. Update Public Schema (PostgREST)
  const publicRes = await fetch(`${clientUrl}/rest/v1/User?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(updates)
  });

  if (!publicRes.ok) {
    const errorText = await publicRes.text();
    throw new Error(`Data Update failed: ${errorText}`);
  }

  results.data = await publicRes.json();
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

      // Wait for client DB trigger to potentially fire
      await new Promise(r => setTimeout(r, 800));

      // UPSERT to public.User
      await fetch(`${clientUrl}/rest/v1/User`, {
        method: "POST",
        headers: {
          apikey: clientKey,
          Authorization: `Bearer ${clientKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({ id: newUser.id, email, role }),
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

  // 2. Delete from public.User (Explicit cleanup)
  const res = await fetch(`${clientUrl}/rest/v1/User?id=eq.${userId}`, {
    method: "DELETE",
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    console.warn(`Public user record cleanup failed (might already be gone): ${txt}`);
  }

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

  // Sync active status in public table
  const res = await fetch(`${clientUrl}/rest/v1/User?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ativo: active })
  });

  if (!res.ok) throw new Error(`Status sync failed: ${await res.text()}`);

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
    .from("entidades")
    .update({
      key_status: health.status,
      last_health_check_at: new Date().toISOString(),
      health_error_detail: health.error || null
    })
    .eq("id", clientId);
    
  if (error) console.error("Erro ao salvar status de sa├║de no banco Master:", error);
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

async function healthCheck(clientUrl: string, clientKey?: string) {
  if (!clientKey) {
    // Legacy/Basic check if key not provided
    try {
      const res = await fetch(clientUrl, { method: "OPTIONS" });
      return { status: res.status < 500 ? "online" : "offline", code: res.status };
    } catch (e) {
      return { status: "offline", error: (e as Error).message };
    }
  }

  // Full validation check
  const health = await testClientConnection(clientUrl, clientKey);
  return {
    status: health.status === 'valid' ? 'online' : 'offline',
    latency: health.latency,
    error: health.error
  };
}

async function getOeirasConfig(supabaseAdmin: SupabaseClient) {
  const { data: oeiras, error } = await supabaseAdmin
    .from("entidades")
    .select("id, nome_entidade, supabase_url, supabase_secret_keys, supabase_access_token")
    .eq("tenant_code", "sinpesca-oeiras")
    .single();
  if (error || !oeiras) throw new Error("Oeiras (Fonte de Verdade) não encontrada no cadastro de entidades");
  return oeiras;
}

async function buildViewSyncSql(
  supabaseAdmin: SupabaseClient,
  objectName: string,
  schemaName: string,
) {
  assertSafeIdentifier(objectName, "objectName");
  assertSafeIdentifier(schemaName, "schema");

  const oeiras = await getOeirasConfig(supabaseAdmin);
  if (!oeiras.supabase_access_token) {
    throw createHttpError("PAT do tenant de referência ausente", 500);
  }

  const schemaLiteral = schemaName.replace(/'/g, "''");
  const objectLiteral = objectName.replace(/'/g, "''");
  const qualified = `${quoteIdentifier(schemaName)}.${quoteIdentifier(objectName)}`;

  const viewRows = await runSql(
    oeiras.supabase_url,
    oeiras.supabase_access_token,
    `SELECT pg_get_viewdef(format('%I.%I', '${schemaLiteral}', '${objectLiteral}')::regclass, true) AS definition`
  );

  const definition = viewRows?.[0]?.definition;
  if (!definition) {
    throw createHttpError(`View ${schemaName}.${objectName} não encontrada em Oeiras`, 404);
  }

  return [
    `CREATE OR REPLACE VIEW ${qualified} AS`,
    definition.trim().replace(/;$/, ""),
    ";",
    `REVOKE ALL ON TABLE ${qualified} FROM ${quoteIdentifier("anon")}, ${quoteIdentifier("authenticated")}, ${quoteIdentifier("service_role")};`,
    `GRANT SELECT ON TABLE ${qualified} TO ${quoteIdentifier("anon")};`,
    `GRANT SELECT ON TABLE ${qualified} TO ${quoteIdentifier("authenticated")};`,
    `GRANT SELECT ON TABLE ${qualified} TO ${quoteIdentifier("service_role")};`,
  ].join("\n");
}

async function applySchemaDrift(
  clientId: string,
  client: ClientConfig,
  supabaseAdmin: SupabaseClient,
  params: Record<string, unknown>,
) {
  const { objectType, objectName, schema = "public", mode } = params as ApplySchemaDriftParams;

  if (client.tenant_code === "sinpesca-oeiras") {
    throw createHttpError("O tenant de referência não pode ser sincronizado contra ele mesmo", 400);
  }

  if (!client.supabase_access_token) {
    throw createHttpError(`PAT ausente para o tenant ${clientId}`, 400);
  }

  if (objectType !== "view") {
    throw createHttpError(`Tipo de objeto ainda não suportado: ${objectType}`, 400);
  }

  if (mode !== "dry-run" && mode !== "apply") {
    throw createHttpError("Modo inválido", 400);
  }

  const sql = await buildViewSyncSql(supabaseAdmin, objectName, schema);

  if (mode === "dry-run") {
    return { success: true, mode, objectType, objectName, schema, sql };
  }

  try {
    await runSql(client.supabase_url, client.supabase_access_token, sql);
    return {
      success: true,
      mode,
      objectType,
      objectName,
      schema,
      sql,
      appliedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createHttpError(`Falha ao sincronizar ${schema}.${objectName}: ${message}`, 400);
  }
}

async function getAllMigrationsStatus(supabaseAdmin: SupabaseClient) {
  // 1. Lê OEIRAS UMA ÚNICA VEZ
  const oeiras = await getOeirasConfig(supabaseAdmin);
  const oeirasMigrations = await runSql(
    oeiras.supabase_url,
    oeiras.supabase_access_token!,
    "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version ASC"
  );
  const oeirasVersions = (oeirasMigrations || []).map((m: any) => m.version);
  const latestOeirasVersion = oeirasVersions.at(-1) ?? null;
  const oeirasTotal = oeirasVersions.length;

  // 2. Lê todos os tenants do Admin (exceto OEIRAS)
  const { data: tenants, error } = await supabaseAdmin
    .from("entidades")
    .select("id, nome_entidade, supabase_url, supabase_access_token")
    .neq("tenant_code", "sinpesca-oeiras")
    .not("supabase_access_token", "is", null);

  if (error) throw new Error(`Erro ao buscar tenants: ${error.message}`);

  // 3. Calcula diff para cada tenant (sequencial — evita fan-out)
  const results: Record<string, any> = {};

  // Inclui OEIRAS como sincronizado
  results[oeiras.id] = {
    tenantName: oeiras.nome_entidade,
    latestOeirasVersion,
    latestTenantVersion: latestOeirasVersion,
    pendingCount: 0,
    pending: [],
    hasPending: false,
    applied: oeirasTotal,
    total: oeirasTotal,
  };

  for (const tenant of tenants ?? []) {
    try {
      let tenantVersions: string[] = [];
      try {
        const rows = await runSql(
          tenant.supabase_url,
          tenant.supabase_access_token!,
          "SELECT version FROM supabase_migrations.schema_migrations"
        );
        tenantVersions = (rows || []).map((r: any) => r.version);
      } catch {
        // Tenant sem tabela ainda — tudo pendente
      }

      const tenantVersionSet = new Set(tenantVersions);
      const pending = oeirasVersions.filter(v => !tenantVersionSet.has(v));

      results[tenant.id] = {
        tenantName: tenant.nome_entidade,
        latestOeirasVersion,
        latestTenantVersion: tenantVersions.at(-1) ?? null,
        pendingCount: pending.length,
        pending,
        hasPending: pending.length > 0,
      };
    } catch (e) {
      results[tenant.id] = {
        tenantName: tenant.nome_entidade,
        error: e instanceof Error ? e.message : String(e),
        hasPending: false,
        pendingCount: 0,
      };
    }
  }

  return { 
    success: true, 
    oeirasVersion: latestOeirasVersion, 
    oeirasTotal,
    tenants: results 
  };
}

async function getMigrationsStatus(tenantId: string, clientUrl: string, clientKey: string, supabaseAdmin: SupabaseClient) {
  // 1. Get Oeiras Config (Fonte de Verdade)
  const oeiras = await getOeirasConfig(supabaseAdmin);
  
  // 2. Read Oeiras migrations via Management API
  const oeirasMigrations = await runSql(
    oeiras.supabase_url, 
    oeiras.supabase_access_token!, 
    "SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version ASC"
  );

  // 3. Read Target Tenant migrations (Direct Source of Truth) via Management API
  const client = await getClientConfig(supabaseAdmin, tenantId);
  let tenantMigrations = [];
  try {
    tenantMigrations = await runSql(
      client.supabase_url,
      client.supabase_access_token!,
      "SELECT version FROM supabase_migrations.schema_migrations"
    );
  } catch (e) {
    console.warn(`Aviso: Erro ao ler migrations do tenant ${tenantId}: ${e.message}`);
  }

  const existingMap = new Map(tenantMigrations?.map((m: any) => [m.version, true]) || []);

  const migrations = (oeirasMigrations || []).map((m: any) => {
    const isApplied = existingMap.has(m.version);
    return {
      version: m.version,
      name: `${m.version}_${m.name}`,
      status: isApplied ? 'success' : 'pending',
      appliedAt: null, // Removido por inconsistência entre versões do CLI
      statementsCount: m.statements?.length || 0
    };
  });

  const appliedCount = migrations.filter(m => m.status === 'success').length;
  const pendingCount = migrations.length - appliedCount;

  return {
    success: true,
    total: migrations.length,
    applied: appliedCount,
    pending: pendingCount,
    hasPending: pendingCount > 0,
    migrations
  };
}

async function executeMigration(
  tenantId: string, 
  supabaseAdmin: SupabaseClient
) {
  // 1. Get configs
  const [oeiras, client] = await Promise.all([
    getOeirasConfig(supabaseAdmin),
    getClientConfig(supabaseAdmin, tenantId)
  ]);

  // 2. Fetch all migrations from Oeiras (Ground Truth)
  const oeirasMigrations = await runSql(
    oeiras.supabase_url,
    oeiras.supabase_access_token!,
    "SELECT * FROM supabase_migrations.schema_migrations ORDER BY version ASC"
  );

  // 3. Fetch applied versions from target tenant
  let existing: { version: string }[] = [];
  try {
    existing = await runSql(
      client.supabase_url,
      client.supabase_access_token!,
      "SELECT version FROM supabase_migrations.schema_migrations"
    );
  } catch (e) {
    console.warn("Tenant likely has no schema_migrations table yet. Proceeding with full migration.");
  }

  const existingSet = new Set(existing?.map((m: any) => m.version));
  const pending = (oeirasMigrations || []).filter((m: any) => !existingSet.has(m.version));

  if (pending.length === 0) return { success: true, message: "Já está atualizado" };

  const appliedVersions = [];
  const tenantClient = createClient(client.supabase_url, client.supabase_secret_keys!);

  for (const migration of pending) {
    const statements: string[] = migration.statements;
    if (!statements || statements.length === 0) continue;

    // Gate de segurança
    const safeStatements = statements.filter(isSafe);
    if (safeStatements.length !== statements.length) {
      throw new Error(`Migration ${migration.version} bloqueada: contém comandos DDL perigosos.`);
    }

    try {
      const sql = ['BEGIN;', ...safeStatements, 'COMMIT;'].join('\n');
      await runSql(client.supabase_url, client.supabase_access_token!, sql);

      // Registrar sucesso no Admin para observabilidade (Substitui INSERT no tenant)
      await supabaseAdmin.from('schema_migrations').upsert({
        tenant_id: tenantId,
        version: migration.version,
        migration_name: migration.name,
        status: 'success',
        applied_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,version' });

      appliedVersions.push(migration.version);
    } catch (err) {
      console.error(`Falha na migration ${migration.version}:`, err);
      // Registra erro no Admin para diagnóstico
      await supabaseAdmin.from('schema_migrations').upsert({
        tenant_id: tenantId,
        version: migration.version,
        migration_name: migration.name,
        status: 'error',
        error_detail: err instanceof Error ? err.message : String(err)
      }, { onConflict: 'tenant_id,version' });
      
      throw err; // Aborta para preservar ordem
    }
  }

  return { success: true, appliedCount: appliedVersions.length, versions: appliedVersions };
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

async function syncTrialLimits(
  clientUrl: string,
  clientKey: string,
  acessoExpiraEm: string | null,
  maxSocios: number | null
) {
  // Use the same logic as repairUserSync for consistency
  return await repairUserSync(clientUrl, clientKey, {
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

async function repairUserSync(
  clientUrl: string, 
  clientKey: string, 
  limits: { acesso_expira_em: string | null, max_socios: number | null }
) {
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

  // 4. Sync Global Config (max_socios AND acesso_expira_em)
  const configUpdates: Record<string, unknown> = {};
  if (limits.max_socios !== null) configUpdates.max_socios = limits.max_socios;
  if (limits.acesso_expira_em !== null) configUpdates.acesso_expira_em = limits.acesso_expira_em;

  if (Object.keys(configUpdates).length > 0) {
    await fetch(`${clientUrl}/rest/v1/configuracao_entidade?id=eq.1`, {
      method: "PATCH",
      headers: {
        apikey: clientKey,
        Authorization: `Bearer ${clientKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(configUpdates)
    });
  }

  // 5. Repair Auth Metadata: CLEANUP is_admin AND set role AND heal ban_duration
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
    case "health-check": return await healthCheck(clientUrl, clientKey);
    case "delete-client-member": 
      return await deleteClientUser(clientUrl, clientKey, params?.userId as string);
    case "ban-client-member":
      return await banClientUser(clientUrl, clientKey, params?.userId as string, params?.active as boolean);
    case "repair-user-sync": return await repairUserSync(clientUrl, clientKey, {
      acesso_expira_em: params?.acesso_expira_em as string | null,
      max_socios: params?.max_socios as number | null
    });
    case "execute-raw-sql": // New: For seeds or maintenance
      if (!params?.sql) throw new Error("Missing SQL");
      return await executeRawSql(clientUrl, params.supabase_access_token as string, params.sql as string);
    default: throw new Error(`Invalid action: ${action}`);
  }
}

interface ClientConfig {
  supabase_url: string;
  supabase_secret_keys?: string;
  supabase_access_token?: string;
  acesso_expira_em?: string | null;
  max_socios?: number | null;
  key_status?: string;
  last_health_check_at?: string | null;
  tenant_code?: string;
}

interface ApplySchemaDriftParams {
  objectType: 'view';
  objectName: string;
  schema?: string;
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

async function handleMigrationActions(action: string, clientId: string, client: ClientConfig, supabaseAdmin: SupabaseClient, params: Record<string, unknown>) {
  if (action === "get-all-migrations-status") {
    return await getAllMigrationsStatus(supabaseAdmin);
  }

  if (action === "get-migrations-status") {
    return await getMigrationsStatus(clientId, client.supabase_url, client.supabase_secret_keys!, supabaseAdmin);
  }

  if (action === "execute-migration") {
    return await executeMigration(clientId, supabaseAdmin);
  }

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
    return await repairUserSync(
      client.supabase_url,
      client.supabase_secret_keys,
      {
        acesso_expira_em: client.acesso_expira_em ?? null,
        max_socios: client.max_socios ?? null
      }
    );
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

    // If key is known to be broken, block critical management actions
    // BUT allow migration actions because they might be the fix
    const isMigrationAction =
      action === 'get-migrations-status' ||
      action === 'execute-migration' ||
      action === 'apply-schema-drift';
    if (health.status === 'broken' && action !== 'health-check' && !isMigrationAction) {
      throw new Error("Conex├úo com o inquilino interrompida (Service Role Key Inv├ílida). Verifique as configura├º├Áes.");
    }
  }

  const migrationResult = await handleMigrationActions(action, clientId, client, supabaseAdmin, params);
  if (migrationResult) return migrationResult;

  const limitResult = await handleLimitActions(action, clientId, client);
  if (limitResult) return limitResult;

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
  console.log(`DEBUG: Fetching config for client ${clientId}...`);
  const { data: client, error } = await supabase
    .from("entidades")
    .select("supabase_url, supabase_secret_keys, supabase_access_token, acesso_expira_em, max_socios, key_status, last_health_check_at, tenant_code")
    .eq("id", clientId)
    .single();

  if (error || !client) {
    console.error(`DEBUG: Error fetching client config: ${error?.message}`);
    throw createHttpError(`Client reach error: ${error?.message || "Not found"}`, 404);
  }
  return client;
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
