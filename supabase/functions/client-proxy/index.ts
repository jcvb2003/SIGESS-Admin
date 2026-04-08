// @ts-expect-error: Deno-specific URL imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno-specific URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { migrationsBundle } from "../_shared/migrations_bundle.ts";
import { seedSql } from "../_shared/seed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // 2. Fetch from public.User
  let publicUsers: unknown[] = [];
  try {
    const publicRes = await fetch(`${clientUrl}/rest/v1/User?select=id,acesso_expira_em,max_socios,role`, {
      headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
    });

    if (publicRes.ok) {
      publicUsers = await publicRes.json();
    }
  } catch (e) {
    console.error("Failed to fetch from public.User:", e);
  }

  const safePublicUsers = Array.isArray(publicUsers) ? publicUsers : [];

  // 3. Merge including app_metadata and role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = authUsers.map((au: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pu: any = safePublicUsers.find((p: any) => p.id === au.id);

    // Prioritize 'role' in app_metadata (Canon for SIGESS)
    const roleFromMetadata = au.app_metadata?.role;
    const isAdmin = roleFromMetadata === 'admin' || au.app_metadata?.is_admin === true;
    
    // Final role determination
    const finalRole = pu?.role || roleFromMetadata || (isAdmin ? 'admin' : 'user');

    return {
      ...au,
      isAdmin: finalRole === 'admin',
      role: finalRole,
      acesso_expira_em: pu?.acesso_expira_em || null,
      max_socios: pu?.max_socios || null,
      // Metadata check for UI warning if legacy
      hasLegacyMetadata: !!au.app_metadata?.is_admin
    };
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

async function createClientUser(clientUrl: string, clientKey: string, params?: Record<string, unknown>, limits?: { acesso_expira_em: string | null, max_socios: number | null }) {
  const { email, role, password, autoConfirm } = params as {
    email: string,
    role: string,
    password?: string,
    autoConfirm?: boolean
  };

  if (!email) throw new Error("Missing email for new user");

  const supabase = createClient(clientUrl, clientKey);

  // 1. If password provided, use createUser (Supabase Style)
  if (password) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: autoConfirm ?? true,
      app_metadata: { role }, // Standardized key
      user_metadata: { role }
    });

    if (error) throw error;

    if (data.user) {
      // Ensure app_metadata is clean (Supabase sometimes merges defaults)
      await supabase.auth.admin.updateUserById(data.user.id, {
        app_metadata: { role },
      });

      // Wait for client DB trigger to potentially fire
      await new Promise(r => setTimeout(r, 800));

      // UPSERT to public.User via PostgREST
      await fetch(`${clientUrl}/rest/v1/User`, {
        method: "POST",
        headers: {
          apikey: clientKey,
          Authorization: `Bearer ${clientKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          id: data.user.id,
          email: email,
          role: role,
          acesso_expira_em: limits?.acesso_expira_em ?? null,
          max_socios: limits?.max_socios ?? null
        })
      });
    }

    return { user: data.user, mode: 'direct' };
  }

  // 2. Otherwise use Invite (Magic Link)
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { role },
  });

  if (error) throw error;

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { role } }
  });

  if (data.user) {
    await supabase.auth.admin.updateUserById(data.user.id, {
      app_metadata: { role }
    });
  }

  return {
    user: data.user,
    mode: 'invite',
    inviteLink: linkError ? null : linkData.properties.action_link
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

async function healthCheck(clientUrl: string) {
  const start = Date.now();
  try {
    const res = await fetch(clientUrl, { method: "OPTIONS" });
    return {
      status: res.status < 500 ? "online" : "offline",
      latency: Date.now() - start,
      code: res.status
    };
  } catch (e) {
    const err = e as Error;
    return { status: "offline", error: err.message };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMigrationsStatus(tenantId: string, supabaseAdmin: any) {
  const { data: appliedMigrations, error } = await supabaseAdmin
    .from("schema_migrations")
    .select("migration_name, status, applied_at, error_detail")
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Warning: Could not fetch schema_migrations:", error);
  }

  const migrationNames = Object.keys(migrationsBundle).sort((a, b) => a.localeCompare(b));

  let appliedCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  interface SchemaMigration {
    migration_name: string;
    status: string;
    applied_at: string;
    error_detail: string | null;
  }

  const migrations = migrationNames.map(name => {
    const logs = (appliedMigrations as SchemaMigration[] || []).filter(m => m.migration_name === name);
    const successLog = logs.find(m => m.status === 'success');
    // Get most recent failure if any
    const failLog = logs.slice().sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()).find(m => m.status === 'failed');

    if (successLog) {
      appliedCount++;
      return { name, status: 'success', appliedAt: successLog.applied_at, error: null };
    } else if (failLog) {
      failedCount++;
      return { name, status: 'failed', appliedAt: failLog.applied_at, error: failLog.error_detail };
    } else {
      pendingCount++;
      return { name, status: 'pending', appliedAt: null, error: null };
    }
  });

  return {
    success: true,
    total: migrations.length,
    applied: appliedCount,
    failed: failedCount,
    pending: pendingCount,
    hasPending: pendingCount > 0 || failedCount > 0,
    migrations
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeMigration(projectUrl: string, accessToken: string, tenantId: string, supabaseAdmin: any) {
  // 1. Fetch which migrations have already been applied for this tenant in the Admin DB
  const { data: appliedMigrations, error } = await supabaseAdmin
    .from("schema_migrations")
    .select("migration_name")
    .eq("tenant_id", tenantId)
    .eq("status", "success");

  if (error) {
    console.error("Warning: Could not fetch schema_migrations. Is the table created in Admin?", error);
    // Continue for now if table doesn't exist? Ideally we should throw, but let's throw to be safe
    throw new Error(`Failed to fetch applied migrations: ${error.message}`);
  }

  const appliedSet = new Set(appliedMigrations?.map((m: { migration_name: string }) => m.migration_name) || []);

  // Sort migrations
  const migrationNames = Object.keys(migrationsBundle).sort((a, b) => a.localeCompare(b));
  const pendingMigrations = migrationNames.filter(name => !appliedSet.has(name));

  if (pendingMigrations.length === 0) {
    return { success: true, appliedCount: 0, pendingMigrations: [] };
  }

  const projectRef = projectUrl.split(".")[0].split("//")[1];
  let appliedCount = 0;

  for (const migrationName of pendingMigrations) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = (migrationsBundle as any)[migrationName];

    console.log(`Applying migration ${migrationName} for tenant ${tenantId}...`);

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const result = await res.json().catch(() => ({ message: res.statusText }));

      const errorMsg = result.message || "Management API error (" + res.status + ")";
      // Log failure
      await supabaseAdmin.from("schema_migrations").insert({
        tenant_id: tenantId,
        migration_name: migrationName,
        status: "failed",
        error_detail: errorMsg
      });

      throw new Error(`Migration ${migrationName} failed: ${errorMsg}`);
    }

    // Record success
    await supabaseAdmin.from("schema_migrations").insert({
      tenant_id: tenantId,
      migration_name: migrationName,
      status: "success"
    });

    appliedCount++;
  }

  // Apply seed data if 'initial_schema' was just applied
  if (pendingMigrations.some(m => m.includes("initial_schema"))) {
    console.log(`Applying seed data for tenant ${tenantId}...`);
    const seedRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: seedSql }),
    });
    if (!seedRes.ok) {
      console.error("Failed to apply seed data. Migration succeeded however.");
    }
  }

  return { success: true, appliedCount, pendingMigrations };
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
  const publicRes = await fetch(`${clientUrl}/rest/v1/User?select=id,role`, {
    headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
  });
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adminIds = new Set<string>();
  if (publicRes.ok) {
    const publicUsers = await publicRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminIds = new Set(publicUsers.filter((u: any) => u.role === 'admin').map((u: any) => u.id));
  }

  // 3. Bulk UPSERT into public.User
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertPayload = authUsers.map((u: any) => ({
    id: u.id,
    email: u.email,
    // Role is admin if it was already admin in public OR if metadata says so
    role: (adminIds.has(u.id) || u.app_metadata?.is_admin) ? 'admin' : 'user',
    acesso_expira_em: limits.acesso_expira_em,
    max_socios: limits.max_socios,
  }));

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

  // 4. Repair Auth Metadata: CLEANUP is_admin AND set role
  const supabase = createClient(clientUrl, clientKey);
  let repairedCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of authUsers) {
    const isActuallyAdmin = adminIds.has(u.id) || u.app_metadata?.is_admin === true;
    const finalRole = isActuallyAdmin ? 'admin' : (u.app_metadata?.role || 'user');
    
    // Condition to repair: missing 'role' key OR has legacy 'is_admin' key
    const hasRole = u.app_metadata?.role === finalRole;
    const hasLegacy = 'is_admin' in (u.app_metadata || {});

    if (!hasRole || hasLegacy) {
      await supabase.auth.admin.updateUserById(u.id, {
        app_metadata: { role: finalRole }, // This overwrites/cleans app_metadata usually, but let's be sure
        user_metadata: { role: finalRole }
      });
      repairedCount++;
    }
  }

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
    case "health-check": return await healthCheck(clientUrl);
    case "delete-client-member": 
      return await deleteClientUser(clientUrl, clientKey, params?.userId as string);
    case "ban-client-member":
      return await banClientUser(clientUrl, clientKey, params?.userId as string, params?.active as boolean);
    case "repair-user-sync": return await repairUserSync(clientUrl, clientKey, {
      acesso_expira_em: params?.acesso_expira_em as string | null,
      max_socios: params?.max_socios as number | null
    });
    default: throw new Error(`Invalid action: ${action}`);
  }
}

interface ClientConfig {
  supabase_url: string;
  supabase_secret_keys?: string;
  supabase_access_token?: string;
  acesso_expira_em?: string | null;
  max_socios?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAction(clientId: string, action: string, params: Record<string, unknown>, client: ClientConfig, supabaseAdmin: any) {
  if (action === "get-migrations-status") {
    return await getMigrationsStatus(clientId, supabaseAdmin);
  }

  if (action === "execute-migration") {
    if (!client.supabase_access_token || !client.supabase_secret_keys) {
      throw new Error("Supabase Access Token (PAT) ou Service Role Key não configurados para este cliente");
    }
    return await executeMigration(client.supabase_url, client.supabase_access_token, clientId, supabaseAdmin);
  }

  if (action === "sync-trial-limits") {
    if (!client.supabase_secret_keys) {
      throw new Error(`Service role key not configured for client ${clientId}`);
    }

    console.log(`Syncing trial limits: Expira=${client.acesso_expira_em}, Max=${client.max_socios}`);
    return await syncTrialLimits(
      client.supabase_url,
      client.supabase_secret_keys,
      client.acesso_expira_em ?? null,
      client.max_socios ?? null
    );
  }

  if (action === "repair-user-sync") {
    if (!client.supabase_secret_keys) {
      throw new Error(`Service role key not configured for client ${clientId}`);
    }

    return await repairUserSync(
      client.supabase_url,
      client.supabase_secret_keys,
      {
        acesso_expira_em: client.acesso_expira_em ?? null,
        max_socios: client.max_socios ?? null
      }
    );
  }

  if (!client.supabase_secret_keys) {
    throw new Error(`Service role key missing for action ${action}`);
  }

  // Handle user creation with injected limits
  if (action === "create-client-member") {
    return await createClientUser(client.supabase_url, client.supabase_secret_keys, params, {
      acesso_expira_em: client.acesso_expira_em ?? null,
      max_socios: client.max_socios ?? null
    });
  }

  return await performAction(action, client.supabase_url, client.supabase_secret_keys, params);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // @ts-expect-error: Deno global is available in Edge Functions runtime
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // @ts-expect-error: Deno global is available in Edge Functions runtime
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized access to proxy");
    }

    const body = await req.json().catch(() => ({}));
    const { clientId, action, params } = body;

    console.log(`Proxy Action: ${action} for Client: ${clientId}`);

    if (!clientId || !action) {
      throw new Error("Missing clientId or action in request body");
    }

    const { data: client, error: clientError } = await supabaseAdmin
      .from("entidades")
      .select("supabase_url, supabase_secret_keys, supabase_access_token, acesso_expira_em, max_socios")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      console.error(`Client fetch error: ${clientError?.message}`);
      throw new Error(`Client with ID ${clientId} not found`);
    }

    console.log(`Fetched Client: ${client.supabase_url} (Key prefix: ${client.supabase_secret_keys?.substring(0, 5)}...)`);

    const result = await handleAction(clientId, action, params, client, supabaseAdmin);
    console.log(`Action ${action} result: Success`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    let errorMessage = "Erro desconhecido";
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === 'string') {
      errorMessage = err;
    }

    console.error("Critical Proxy Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200, // Return 200 so supabase-js doesn't mask the error body
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
