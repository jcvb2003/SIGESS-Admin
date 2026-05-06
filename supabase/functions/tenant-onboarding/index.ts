// @ts-expect-error: Deno-specific URL imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno-specific URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error: Deno-specific URL imports
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_INVITE_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Convite para o SIGESS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px;">
                            <div style="font-size: 20px; font-weight: 800; color: #059669; letter-spacing: 1px; display: inline-block; padding: 8px 16px; background-color: #ecfdf5; border-radius: 8px; border: 1px solid #d1fae5;">
                                SIGESS
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px 40px 30px 40px;">
                            <h1 style="margin: 0 0 16px 0; font-size: 32px; line-height: 1.15; font-weight: 800; color: #27272a; text-align: center;">
                                Simplifique a gestão da<br>
                                sua <span style="color: #3f7356;">entidade de pesca</span>
                            </h1>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #71717a; text-align: center;">
                                Chega de planilhas, cadernos e perda de tempo. O SIGESS organiza seus sócios, documentos e finanças de forma simples, segura e 100% online.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr><td style="border-top: 1px solid #e4e4e7;"></td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="left" style="padding: 30px 40px 10px 40px;">
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">Olá,</p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Você foi convidado(a) para criar um usuário administrativo no <strong>SIGESS</strong> através do portal <a href="https://app.sigess.com.br" style="color: #059669; text-decoration: none;">app.sigess.com.br</a>.
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Para aceitar o convite e definir sua senha de acesso, clique no botão abaixo:
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 40px 40px;">
                            <table border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="border-radius: 6px;" bgcolor="#059669">
                                        <a href="{{ .ConfirmationURL }}" target="_blank" style="font-size: 16px; font-weight: bold; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 14px 32px; border: 1px solid #059669; display: inline-block;">
                                            Aceitar Convite e Acessar
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 30px 40px; background-color: #fafafa;">
                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #a1a1aa; padding-top: 30px;">
                                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                                <a href="{{ .ConfirmationURL }}" style="color: #059669; word-break: break-all; text-decoration: underline;">{{ .ConfirmationURL }}</a>
                            </p>
                        </td>
                    </tr>
                </table>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
                    <tr>
                        <td align="center" style="padding: 24px 20px;">
                            <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                                © SIGESS - Sistema de Gestão para Entidades de Pesca.<br>
                                Se você não esperava por este convite, pode ignorar este email com segurança.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

const EMAIL_RECOVERY_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redefinição de Senha — SIGESS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
                    <tr>
                        <td align="center" style="padding: 40px 40px 20px 40px;">
                            <div style="font-size: 20px; font-weight: 800; color: #059669; letter-spacing: 1px; display: inline-block; padding: 8px 16px; background-color: #ecfdf5; border-radius: 8px; border: 1px solid #d1fae5;">
                                SIGESS
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 10px 40px 30px 40px;">
                            <h1 style="margin: 0 0 16px 0; font-size: 32px; line-height: 1.15; font-weight: 800; color: #27272a; text-align: center;">
                                Redefinição de<br>
                                <span style="color: #3f7356;">senha de acesso</span>
                            </h1>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #71717a; text-align: center;">
                                Recebemos uma solicitação para redefinir a senha da sua conta no SIGESS. Se não foi você, ignore este email.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px;">
                            <table width="100%" border="0" cellspacing="0" cellpadding="0">
                                <tr><td style="border-top: 1px solid #e4e4e7;"></td></tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="left" style="padding: 30px 40px 10px 40px;">
                            <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">Olá,</p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Clique no botão abaixo para criar uma nova senha para a sua conta <strong>{{ .Email }}</strong> no SIGESS.
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #3f3f46;">
                                Este link é válido por <strong>1 hora</strong> e pode ser usado apenas uma vez.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 40px 40px;">
                            <table border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center" style="border-radius: 6px;" bgcolor="#059669">
                                        <a href="{{ .ConfirmationURL }}" target="_blank" style="font-size: 16px; font-weight: bold; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 14px 32px; border: 1px solid #059669; display: inline-block;">
                                            Redefinir Minha Senha
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding: 0 40px 30px 40px; background-color: #fafafa;">
                            <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #a1a1aa; padding-top: 30px;">
                                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                                <a href="{{ .ConfirmationURL }}" style="color: #059669; word-break: break-all; text-decoration: underline;">{{ .ConfirmationURL }}</a>
                            </p>
                        </td>
                    </tr>
                </table>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px;">
                    <tr>
                        <td align="center" style="padding: 24px 20px;">
                            <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a1a1aa;">
                                © SIGESS - Sistema de Gestão para Entidades de Pesca.<br>
                                Se você não solicitou a redefinição de senha, ignore este email. Sua senha permanece a mesma.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
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
        total_steps: 7
      })
      .select("id")
      .single();

    if (jobError || !job) throw new Error("Failed to initialize job: " + (jobError ? jobError.message : ""));
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
  const updates: Record<string, any> = { status };
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
    if (accountErr || !accountData) throw new Error("Falha ao carregar conta Supabase: " + (accountErr ? accountErr.message : ""));

    const resendApiKey = sysConfig.resend_api_key || Deno.env.get("RESEND_API_KEY");
    const managementToken = accountData.management_token;

    if (!managementToken || !resendApiKey) {
      throw new Error("Configuracoes incompletas (Supabase ou Resend ausentes).");
    }

    // 1. Keys
    await updateJob(supabaseAdmin, jobId, "fetching_keys", 1);
    const { anonKey, serviceRoleKey } = await fetchProjectKeys(projectRef, managementToken);

    // 2. Auth & SMTP
    await updateJob(supabaseAdmin, jobId, "configuring_auth", 1);
    await setupProjectAuth(projectRef, managementToken, resendApiKey, sysConfig.resend_from_email);

    // 3. Database (Migrations & Seed)
    await updateJob(supabaseAdmin, jobId, "running_migrations", 1);
    await runProjectMigrations(projectRef, managementToken, supabaseAdmin);

    // 4. Admin User
    if (adminEmail) {
      await updateJob(supabaseAdmin, jobId, "creating_admin", 1);
      const tempPass = sysConfig.default_admin_password || Deno.env.get("DEFAULT_ADMIN_PASSWORD") || "Mudar@12345";
      await createAdminUser(projectUrl, serviceRoleKey, adminEmail, tempPass);
    } else {
      // Pular passo do admin se não fornecido para manter contagem consistente
      await updateJob(supabaseAdmin, jobId, "creating_admin", 1);
    }

    // 5. Registration
    await updateJob(supabaseAdmin, jobId, "registering_tenant", 1);
    const entidadeId = await registerTenantInCentral(supabaseAdmin, tenantLabel, tenantCode, projectUrl, anonKey, serviceRoleKey, managementToken);

    // 6. Finalization
    await updateJob(supabaseAdmin, jobId, "finalizing_setup", 1, undefined, entidadeId);
    await supabaseAdmin.rpc('increment_active_projects', { account_id: supabaseAccountId });

    // 7. Finalização
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
  
  const publishableEntry = keys.find((k) => k.api_key.startsWith("sb_publishable_"));
  const pubKey = publishableEntry ? publishableEntry.api_key : undefined;
  const anonEntry = keys.find((k) => k.name === "anon");
  const anonKey = pubKey || (anonEntry ? anonEntry.api_key : undefined);
  const serviceRoleEntry = keys.find((k) => k.name === "service_role");
  const serviceRoleKey = serviceRoleEntry ? serviceRoleEntry.api_key : undefined;
  
  if (!anonKey || !serviceRoleKey) throw new Error("Chaves de API (anon/publishable ou service_role) ausentes.");
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
      mailer_subjects_invite: "Convite para acessar o SIGESS",
      mailer_templates_invite_content: EMAIL_INVITE_TEMPLATE,
      mailer_subjects_recovery: "Redefina sua senha no SIGESS",
      mailer_templates_recovery_content: EMAIL_RECOVERY_TEMPLATE,
    }),
  });
  if (!res.ok) throw new Error(`Config Auth error: ${await res.text()}`);
}

async function fetchSqlFromStorage(supabaseAdmin: SupabaseClient, filename: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from('migrations').download(filename);
  if (error || !data) throw new Error("Storage fetch failed for " + filename + ": " + (error ? error.message : ""));
  return new TextDecoder('utf-8').decode(await data.arrayBuffer());
}

async function runProjectMigrations(projectRef: string, accessToken: string, supabaseAdmin: SupabaseClient) {
  const queryApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const runQuery = async (query: string) => {
    const res = await fetch(queryApiUrl, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Management API error: ${err.message || res.statusText}`);
    }
  };

  const initialSchema = await fetchSqlFromStorage(supabaseAdmin, 'initial_schema.sql');
  await runQuery(initialSchema);

  const seed = await fetchSqlFromStorage(supabaseAdmin, 'seed.sql');
  await runQuery(seed);

  return { success: true };
}

async function createAdminUser(url: string, key: string, email: string, pass: string) {
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: authError } = await client.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (authError && !authError.message.includes("already exists")) throw authError;

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
  const { data: existing } = await admin.from('entidades').select('id').eq('tenant_code', code.toLowerCase()).single();
  if (existing) return existing.id;

  const { data: tenant, error } = await admin.from('entidades').insert({
    nome_entidade: label, tenant_code: code.toLowerCase(), supabase_url: url,
    supabase_publishable_key: anon, supabase_secret_keys: sr, supabase_access_token: pat, assinatura: 'anual'
  }).select('id').single();
  if (error || !tenant) throw new Error("Failed to register tenant: " + (error ? error.message : ""));

  // O monitoramento de schema agora é feito via observability (schema_sync_status)
  return tenant.id;
}
