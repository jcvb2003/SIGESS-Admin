// @ts-expect-error: Deno-specific URL imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno-specific URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import { migrationsBundle } from "../_shared/migrations_bundle.ts";
import { seedSql } from "../_shared/seed.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OnboardingPayload {
  tenantCode: string;
  tenantLabel: string;
  projectRef: string;
  adminEmail?: string;
  supabaseAccountId: string;
}

interface SystemSetting {
  key: string;
  value: string;
}

interface SupabaseApiKey {
  name: string;
  api_key: string;
}

// Ensure global type definition for EdgeRuntime and Deno are present
declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };
declare const Deno: { env: { get(key: string): string | undefined } };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response("ok", { headers: corsHeaders }); }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) throw new Error("Unauthorized: Invalid admin token");

    const payload: OnboardingPayload = await req.json();
    if (!payload.tenantCode || !payload.tenantLabel || !payload.projectRef || !payload.supabaseAccountId) {
      throw new Error("Missing required payload fields");
    }

    const { data: job, error: jobError } = await supabaseAdmin
      .from("onboarding_jobs")
      .insert({
        tenant_code: payload.tenantCode,
        tenant_label: payload.tenantLabel,
        project_ref: payload.projectRef,
        admin_email: payload.adminEmail || null,
        supabase_account_id: payload.supabaseAccountId,
        status: "pending",
        current_step: 0,
        total_steps: payload.adminEmail ? 10 : 8
      })
      .select("id")
      .single();

    if (jobError || !job) throw new Error(`Failed to initialize job: ${jobError?.message}`);
    EdgeRuntime.waitUntil(processOnboarding(job.id, payload, supabaseAdmin));

    return new Response(JSON.stringify({ jobId: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function updateJob(
  supabaseAdmin: SupabaseClient, 
  jobId: string, 
  status: string, 
  stepIncrement: number = 0, 
  error_detail?: string, 
  entidadeId?: string
) {
  const updates: Record<string, string | number | null> = { status };
  if (error_detail) updates.error_detail = error_detail;
  if (entidadeId) updates.entidade_id = entidadeId;
  if (['completed', 'failed'].includes(status)) updates.completed_at = new Date().toISOString();

  if (stepIncrement > 0) {
    const { data } = await supabaseAdmin.from('onboarding_jobs').select('current_step').eq('id', jobId).single();
    if (data) updates.current_step = (data.current_step || 0) + stepIncrement;
  }
  await supabaseAdmin.from('onboarding_jobs').update(updates).eq('id', jobId);
}

// --- Main background processing ---
async function processOnboarding(jobId: string, payload: OnboardingPayload, supabaseAdmin: SupabaseClient) {
  try {
    const { projectRef, tenantCode, tenantLabel, adminEmail, supabaseAccountId } = payload;
    const projectUrl = `https://${projectRef}.supabase.co`;

    const { data: settingsData } = await supabaseAdmin.from("system_settings").select("key, value");
    const sysConfig = Object.fromEntries((settingsData as SystemSetting[] || []).map((s: SystemSetting) => [s.key, s.value]));

    const { data: accountData, error: accountErr } = await supabaseAdmin
      .from("supabase_accounts").select("management_token").eq("id", supabaseAccountId).single();
    if (accountErr || !accountData) throw new Error(`Falha ao carregar conta Supabase: ${accountErr?.message}`);

    const vercelProjectId = sysConfig.vercel_project_id || Deno.env.get("VERCEL_PROJECT_ID");
    const vercelToken = sysConfig.vercel_token || Deno.env.get("VERCEL_TOKEN");
    const resendApiKey = sysConfig.resend_api_key || Deno.env.get("RESEND_API_KEY");
    const managementToken = accountData.management_token;

    if (!vercelProjectId || !vercelToken || !managementToken || !resendApiKey) {
      throw new Error("Configurações incompletas (Vercel, Supabase ou Resend ausentes).");
    }

    // 1. Keys
    await updateJob(supabaseAdmin, jobId, "fetching_keys", 1);
    const { anonKey, serviceRoleKey } = await fetchProjectKeys(projectRef, managementToken);

    // 2. Auth & SMTP
    await updateJob(supabaseAdmin, jobId, "configuring_auth", 1);
    await setupProjectAuth(projectRef, managementToken, resendApiKey, sysConfig.resend_from_email);

    // 3. Database (Migrations & Seed)
    await updateJob(supabaseAdmin, jobId, "running_migrations", 1);
    await runProjectMigrations(projectRef, managementToken);

    await updateJob(supabaseAdmin, jobId, "seeding", 1);
    await runProjectSeed(projectUrl, serviceRoleKey, tenantLabel, tenantCode, managementToken, projectRef);

    // 4. Admin User
    if (adminEmail) {
      await updateJob(supabaseAdmin, jobId, "creating_admin", 1);
      const tempPass = sysConfig.default_admin_password || Deno.env.get("DEFAULT_ADMIN_PASSWORD") || "Mudar@12345";
      await createAdminUser(projectUrl, serviceRoleKey, adminEmail, tempPass);
      await updateJob(supabaseAdmin, jobId, "creating_admin", 1); 
    }

    // 5. Registration
    await updateJob(supabaseAdmin, jobId, "registering_tenant", 1);
    const entidadeId = await registerTenantInCentral(supabaseAdmin, tenantLabel, tenantCode, projectUrl, anonKey, serviceRoleKey, managementToken);

    // 6. Integrations (Vercel & Stats)
    await updateJob(supabaseAdmin, jobId, "vercel_setup", 1, undefined, entidadeId);
    await setupVercelEnv(vercelProjectId, vercelToken, tenantCode, projectUrl, anonKey);
    await triggerVercelRedeploy(vercelProjectId, vercelToken);
    await supabaseAdmin.rpc('increment_active_projects', { account_id: supabaseAccountId });

    await updateJob(supabaseAdmin, jobId, "completed", 1);
  } catch (error) {
    console.error(`[Job ${jobId}] Failed:`, error);
    await updateJob(supabaseAdmin, jobId, "failed", 0, error instanceof Error ? error.message : String(error));
  }
}

// --- Helper Functions to keep complexity low ---

async function fetchProjectKeys(projectRef: string, token: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Fetch Keys error: ${await res.text()}`);
  const keys: SupabaseApiKey[] = await res.json();
  const anonKey = keys.find((k) => k.name === "anon")?.api_key;
  const serviceRoleKey = keys.find((k) => k.name === "service_role")?.api_key;
  if (!anonKey || !serviceRoleKey) throw new Error("Chaves anon ou service_role ausentes.");
  return { anonKey, serviceRoleKey };
}

async function setupProjectAuth(projectRef: string, token: string, resendKey: string, fromEmail?: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      site_url: "https://app.sigess.com.br/password",
      uri_allow_list: "https://app.sigess.com.br/**,https://app.sigess.com.br/password",
      smtp_admin_email: fromEmail || "noreply@sigess.com.br",
      smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend", smtp_pass: resendKey,
      smtp_sender_name: "SIGESS", smtp_enabled: true,
    }),
  });
  if (!res.ok) throw new Error(`Config Auth error: ${await res.text()}`);
}

async function runProjectMigrations(projectRef: string, token: string) {
  const api = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  // 1. Get applied migrations from the target database
  let appliedSet = new Set<string>();
  try {
    const checkRes = await fetch(api, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "SELECT migration_name FROM supabase_migrations.schema_migrations" })
    });
    if (checkRes.ok) {
      const { result } = await checkRes.json();
      if (Array.isArray(result)) {
        appliedSet = new Set(result.map(m => m.migration_name));
      }
    } else {
      // If table doesn't exist, we'll try to create it
      await fetch(api, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text primary key, statements text[], name text, migration_name text unique, status text, error_detail text, created_at timestamptz default now());" })
      });
    }
  } catch (e) {
    console.log("Migration check failed, assuming clean state:", e);
  }

  const migrationNames = Object.keys(migrationsBundle).sort((a, b) => a.localeCompare(b));
  for (const name of migrationNames) {
    if (appliedSet.has(name)) {
      console.log(`Skipping applied migration: ${name}`);
      continue;
    }

    const res = await fetch(api, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: (migrationsBundle as Record<string, string>)[name] })
    });
    
    if (!res.ok) throw new Error(`Migration ${name} Error: ${await res.text()}`);

    // Record success in target DB
    await fetch(api, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ 
        query: `INSERT INTO supabase_migrations.schema_migrations (version, migration_name, status) VALUES ('${name.split('_')[0]}', '${name}', 'success') ON CONFLICT (migration_name) DO UPDATE SET status = 'success';` 
      })
    });
  }
}

async function runProjectSeed(url: string, key: string, label: string, code: string, token: string, projectRef: string) {
  if (!seedSql) return;
  const api = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  
  // Check if seed was already applied (roughly, by checking if the entity name is already updated)
  // Actually, seeding is usually safe to repeat if it uses UPSERT, but our seed might not.
  // For now, we'll just run it. If it fails, it will stop the job, which is fine.
  
  const seedRes = await fetch(api, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: seedSql })
  });
  if (!seedRes.ok) {
    const err = await seedRes.text();
    // If it's a "already exists" error in seed, we might want to ignore it
    if (!err.includes("already exists")) {
      throw new Error(`Seed Error: ${err}`);
    }
  }
  
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  await client.from('entidade').update({ nome_entidade: label, nome_abreviado: code.toUpperCase() }).neq('id', '00000000-0000-0000-0000-000000000000');
}

async function createAdminUser(url: string, key: string, email: string, pass: string) {
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: authError } = await client.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (authError && !authError.message.includes("already exists")) {
    throw authError;
  }
  
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const { data: publicUser } = await client.from("User").select("id").eq("email", email).single();
    if (publicUser) {
      await client.from("User").update({ role: "admin" }).eq("id", publicUser.id);
      break;
    }
  }
}

async function registerTenantInCentral(admin: SupabaseClient, label: string, code: string, url: string, anon: string, sr: string, pat: string) {
  // Check if already registered
  const { data: existing } = await admin.from('entidades').select('id').eq('tenant_code', code.toLowerCase()).single();
  if (existing) return existing.id;

  const { data: tenant, error } = await admin.from('entidades').insert({
    nome_entidade: label, tenant_code: code.toLowerCase(), supabase_url: url,
    supabase_publishable_key: anon, supabase_secret_keys: sr, supabase_access_token: pat, assinatura: 'anual'
  }).select('id').single();
  if (error || !tenant) throw new Error(`Failed to register tenant: ${error?.message}`);
  
  const migrationNames = Object.keys(migrationsBundle).sort((a,b) => a.localeCompare(b));
  await admin.from('schema_migrations').insert(migrationNames.map(n => ({ tenant_id: tenant.id, migration_name: n, status: 'success' })));
  return tenant.id;
}

async function setupVercelEnv(projectId: string, token: string, code: string, url: string, key: string) {
  const sanitizedCode = code.toUpperCase().replace(/-/g, '_');
  const envs = [ 
    {k: `VITE_SUPABASE_URL_${sanitizedCode}`, v: url}, 
    {k: `VITE_SUPABASE_ANON_KEY_${sanitizedCode}`, v: key} 
  ];
  for (const env of envs) {
    const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: env.k, value: env.v, type: "plain", target: ["production", "preview"] })
    });
    if (!res.ok) {
      const errorText = await res.text();
      if (!errorText.includes("already exists")) {
        throw new Error(`Vercel Env error: ${errorText}`);
      }
    }
  }
}

async function triggerVercelRedeploy(projectId: string, token: string) {
  const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&target=production&limit=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    const data = await res.json();
    const last = data.deployments?.[0];
    if (last?.uid) {
      await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentId: last.uid, name: last.name || "sigess", target: "production" })
      });
    }
  }
}
