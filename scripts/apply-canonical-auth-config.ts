import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_TENANT_CODE = "sinpesca-oeiras";
const ONBOARDING_FILE = path.join(
  process.cwd(),
  "supabase",
  "functions",
  "tenant-onboarding",
  "index.ts",
);

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} não definido no .env`);
  return value;
}

function extractProjectRef(projectUrl: string) {
  const host = new URL(projectUrl).hostname;
  const projectRef = host.split(".")[0];
  if (!projectRef) throw new Error(`Não foi possível extrair project ref de ${projectUrl}`);
  return projectRef;
}

function extractBacktickConst(source: string, constName: string) {
  const escapedName = constName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`const\\s+${escapedName}\\s*=\\s*\\\`([\\s\\S]*?)\\\`;`));
  if (!match) throw new Error(`Constante ${constName} não encontrada em tenant-onboarding/index.ts`);
  return match[1];
}

function extractQuotedField(source: string, fieldName: string) {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedName}:\\s*"([^"]+)"`));
  if (!match) throw new Error(`Campo ${fieldName} não encontrado em tenant-onboarding/index.ts`);
  return match[1];
}

function getArgValue(flag: string) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return raw ? raw.slice(flag.length + 1) : undefined;
}

async function main() {
  const adminUrl = requireEnv("VITE_SUPABASE_URL", ADMIN_URL);
  const adminKey = requireEnv("VITE_SUPABASE_SERVICE_ROLE_KEY", ADMIN_KEY);
  const tenantCode = getArgValue("--tenant") ?? DEFAULT_TENANT_CODE;

  const onboardingSource = fs.readFileSync(ONBOARDING_FILE, "utf8");
  const payload = {
    site_url: extractQuotedField(onboardingSource, "site_url"),
    uri_allow_list: extractQuotedField(onboardingSource, "uri_allow_list"),
    mailer_subjects_invite: extractQuotedField(onboardingSource, "mailer_subjects_invite"),
    mailer_templates_invite_content: extractBacktickConst(onboardingSource, "EMAIL_INVITE_TEMPLATE"),
    mailer_subjects_recovery: extractQuotedField(onboardingSource, "mailer_subjects_recovery"),
    mailer_templates_recovery_content: extractBacktickConst(onboardingSource, "EMAIL_RECOVERY_TEMPLATE"),
  };

  const supabaseAdmin = createClient(adminUrl, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: tenant, error } = await supabaseAdmin
    .from("entidades")
    .select("nome_entidade, tenant_code, supabase_url, supabase_access_token")
    .eq("tenant_code", tenantCode)
    .single();

  if (error || !tenant) {
    throw new Error(`Tenant ${tenantCode} não encontrado em entidades`);
  }

  if (!tenant.supabase_access_token) {
    throw new Error(`Tenant ${tenantCode} está sem supabase_access_token`);
  }

  const projectRef = extractProjectRef(tenant.supabase_url);
  const configUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

  const patchResponse = await fetch(configUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tenant.supabase_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!patchResponse.ok) {
    throw new Error(`PATCH auth config falhou: ${await patchResponse.text()}`);
  }

  const verifyResponse = await fetch(configUrl, {
    headers: {
      Authorization: `Bearer ${tenant.supabase_access_token}`,
    },
  });

  if (!verifyResponse.ok) {
    throw new Error(`GET auth config falhou: ${await verifyResponse.text()}`);
  }

  const verified = await verifyResponse.json();

  const checks = [
    ["site_url", verified.site_url, payload.site_url],
    ["uri_allow_list", verified.uri_allow_list, payload.uri_allow_list],
    ["mailer_subjects_invite", verified.mailer_subjects_invite, payload.mailer_subjects_invite],
    ["mailer_subjects_recovery", verified.mailer_subjects_recovery, payload.mailer_subjects_recovery],
    ["mailer_templates_invite_content", verified.mailer_templates_invite_content, payload.mailer_templates_invite_content],
    ["mailer_templates_recovery_content", verified.mailer_templates_recovery_content, payload.mailer_templates_recovery_content],
  ];

  const mismatches = checks.filter(([, actual, expected]) => actual !== expected);
  if (mismatches.length > 0) {
    const fields = mismatches.map(([field]) => field).join(", ");
    throw new Error(`Verificação falhou. Campos divergentes após PATCH: ${fields}`);
  }

  console.log(`Auth config canônico aplicado com sucesso em ${tenant.nome_entidade} (${tenant.tenant_code}).`);
  console.log(`Project ref: ${projectRef}`);
}

main().catch((error) => {
  console.error("❌", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
