// @ts-expect-error: Deno-specific URL imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno-specific URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // 2. Fetch from public.User (try/catch this portion separately)
  let publicUsers: unknown[] = [];
  try {
    const publicRes = await fetch(`${clientUrl}/rest/v1/User?select=id,acesso_expira_em,max_socios`, {
      headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
    });
    
    if (publicRes.ok) {
      publicUsers = await publicRes.json();
    } else {
      const errText = await publicRes.text();
      console.error(`PostgREST error (${publicRes.status}):`, errText);
    }
  } catch (e) {
    console.error("Failed to fetch from public.User:", e);
  }

  // 3. Merge (ensure publicUsers is an array)
  const safePublicUsers = Array.isArray(publicUsers) ? publicUsers : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = authUsers.map((au: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pu: any = safePublicUsers.find((p: any) => p.id === au.id);
    return {
      ...au,
      acesso_expira_em: pu?.acesso_expira_em || null,
      max_socios: pu?.max_socios || null,
    };
  });

  return { users: merged };
}

async function updateClientMember(clientUrl: string, clientKey: string, params?: Record<string, unknown>) {
  const { userId, updates } = params as { userId: string, updates: Record<string, unknown> };
  if (!userId || !updates) throw new Error("Missing userId or updates");

  const res = await fetch(`${clientUrl}/rest/v1/User?id=eq.${userId}`, {
    method: "PATCH",
    headers: { 
      apikey: clientKey, 
      Authorization: `Bearer ${clientKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(updates)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to update user: ${errorText}`);
  }

  return await res.json();
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

async function executeMigration(projectUrl: string, accessToken: string) {
  // @ts-expect-error: Deno global is available in Edge Functions runtime
  const sql = await Deno.readTextFile(new URL("./sigess_schema.sql", import.meta.url));
  
  // Extract project ref from URL (e.g., https://ref.supabase.co)
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
    const result = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(result.message || `Management API error (${res.status})`);
  }

  return await res.json();
}

async function syncTrialLimits(
  clientUrl: string,
  clientKey: string,
  acessoExpiraEm: string | null,
  maxSocios: number | null
) {
  const updates: Record<string, unknown> = {};
  if (acessoExpiraEm !== undefined) updates.acesso_expira_em = acessoExpiraEm;
  if (maxSocios !== undefined) updates.max_socios = maxSocios;

  const res = await fetch(`${clientUrl}/rest/v1/User?id=not.is.null`, {
    method: "PATCH",
    headers: {
      apikey: clientKey,
      Authorization: `Bearer ${clientKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sync failed (${res.status}): ${errText}`);
  }

  const updatedUsers = await res.json();
  return { success: true, updated: Array.isArray(updatedUsers) ? updatedUsers.length : 0 };
}

// Helper to handle client-side actions securely
async function performAction(action: string, clientUrl: string, clientKey: string, params?: Record<string, unknown>) {
  if (!clientUrl || !clientKey) {
    throw new Error("Client URL or Key is missing. Verify the database entry.");
  }

  switch (action) {
    case "list-users": return await listUsers(clientUrl, clientKey);
    case "list-client-members": return await listClientMembers(clientUrl, clientKey);
    case "update-client-member": return await updateClientMember(clientUrl, clientKey, params);
    case "list-tables": return await listTables(clientUrl, clientKey);
    case "list-buckets": return await listBuckets(clientUrl, clientKey);
    case "health-check": return await healthCheck(clientUrl);
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

async function handleAction(clientId: string, action: string, params: Record<string, unknown>, client: ClientConfig) {
  if (action === "execute-migration") {
    if (!client.supabase_access_token) {
      throw new Error("Supabase Access Token (PAT) not configured for this client");
    }
    return await executeMigration(client.supabase_url, client.supabase_access_token);
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

  if (!client.supabase_secret_keys) {
    throw new Error(`Service role key missing for action ${action}`);
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

    const result = await handleAction(clientId, action, params, client);
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
