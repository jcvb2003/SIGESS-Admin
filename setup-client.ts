import * as fs from "node:fs";
import * as path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

// Uso:
// npx ts-node setup-client.ts --project-id=XXXXX --project-ref=YYYYY --admin-email=teste@teste.com --tenant-code=z2 --tenant-label="Colonia Z-2"

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const val = args.find((a) => a.startsWith(`--${name}=`));
  return val ? val.split("=")[1] : null;
};

const projectId = getArg("project-id");
const projectRef = getArg("project-ref");
const adminEmail = getArg("admin-email");
const adminPassword = getArg("admin-password") || "Mudar@1234";
const tenantCode = getArg("tenant-code");
const tenantLabel = getArg("tenant-label");

const corPrimaria = getArg("cor-primaria") || "160 84% 39%";
const corSecundaria = getArg("cor-secundaria") || "152 69% 41%";

if (!projectId || !projectRef || !adminEmail || !tenantCode || !tenantLabel) {
  console.error(
    "❌ Parâmetros obrigatórios faltando: --project-id, --project-ref, --admin-email, --tenant-code, --tenant-label",
  );
  process.exit(1);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const ADMIN_DB_URL = process.env.ADMIN_DB_URL;

if (!RESEND_API_KEY || !SUPABASE_MANAGEMENT_TOKEN || !ADMIN_DB_URL) {
  console.error(
    "❌ Variáveis de ambiente RESEND_API_KEY, SUPABASE_MANAGEMENT_TOKEN e ADMIN_DB_URL são obrigatórias no .env",
  );
  process.exit(1);
}

console.log(`\n🚀 Iniciando configuração do Sindicato via Supabase API (Ref: ${projectRef})...`);

try {
  console.log("🔑 1. Buscando chaves da API...");
  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}` },
  });
  if (!keysRes.ok) throw new Error(`Falha ao buscar chaves: ${await keysRes.text()}`);

  const keys = await keysRes.json();
  const publishableKeyObj = keys.find((k: { api_key?: string }) =>
    k.api_key?.startsWith("sb_publishable_"),
  );
  const anonKeyObj = keys.find((k: { name?: string }) => k.name === "anon");
  const serviceRoleKeyObj = keys.find((k: { name?: string }) => k.name === "service_role");

  const anonKey = publishableKeyObj?.api_key || anonKeyObj?.api_key;
  const serviceRoleKey = serviceRoleKeyObj?.api_key;
  if (!anonKey || !serviceRoleKey) {
    throw new Error("Chaves anon/publishable ou service_role não encontradas na API.");
  }

  const projectSupabaseUrl = `https://${projectRef}.supabase.co`;

  console.log("📧 2. Configurando SMTP Resend e Auth...");
  const authRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      site_url: "https://app.sigess.com.br/password",
      uri_allow_list: "https://app.sigess.com.br/**,https://app.sigess.com.br/password",
      smtp_admin_email: "noreply@sigess.com.br",
      smtp_host: "smtp.resend.com",
      smtp_port: 465,
      smtp_user: "resend",
      smtp_pass: RESEND_API_KEY,
      smtp_sender_name: "SIGESS",
      smtp_enabled: true,
    }),
  });
  if (!authRes.ok) throw new Error(`Falha na configuração do Auth/SMTP: ${authRes.status}`);

  console.log("⚙️ 3. Aplicando Migrations SQL via Management API...");
  const queryApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const runQuery = async (query: string) => {
    const res = await fetch(queryApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || "Erro ao executar query");
    }
  };

  const migrationsDir = path.resolve(process.cwd(), "supabase", "migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrationFiles) {
    console.log(`   ➡️ Aplicando ${file}...`);
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await runQuery(sqlContent);
  }

  console.log("🌱 4. Aplicando Seed de dados...");
  const seedPath = path.resolve(process.cwd(), "supabase", "functions", "client-proxy", "seed.ts");
  const seedFileContent = fs.readFileSync(seedPath, "utf8");
  const seedContentMatch = seedFileContent.match(/const seedSql = `([\s\S]*?)`;/);
  const seedContent = seedContentMatch ? seedContentMatch[1] : "";
  if (seedContent) {
    await runQuery(seedContent);
  } else {
    console.warn("⚠️ Bloco de seed SQL não localizado no arquivo seed.ts");
  }

  console.log("👤 5. Promovendo usuário admin...");
  const supabaseClient = createClient(projectSupabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.warn(`⚠️ Falha ao criar usuário no Auth (${authError?.message}). Pode já existir.`);
  }

  let adminUserId: string | null = null;
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const { data: publicUser } = await supabaseClient
      .from("User")
      .select("id")
      .eq("email", adminEmail)
      .single();

    if (publicUser) {
      adminUserId = publicUser.id;
      break;
    }
  }

  if (adminUserId) {
    const { error: promoteError } = await supabaseClient
      .from("User")
      .update({ role: "admin" })
      .eq("id", adminUserId);
    if (promoteError) {
      console.warn("⚠️ Falha ao atualizar role para admin:", promoteError.message);
    }
  }

  await supabaseClient
    .from("entidade")
    .update({
      nome_entidade: tenantLabel,
      nome_abreviado: tenantCode.toUpperCase(),
      cor_primaria: corPrimaria,
      cor_secundaria: corSecundaria,
    })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("🏢 6. Registrando tenant no Admin Panel...");
  const { Client } = pg;
  const adminDbClient = new Client({ connectionString: ADMIN_DB_URL });
  await adminDbClient.connect();

  const insertTenantRes = await adminDbClient.query(
    `
    INSERT INTO public.entidades (
      nome_entidade,
      supabase_url,
      supabase_publishable_key,
      supabase_secret_keys,
      supabase_access_token,
      assinatura,
      tenant_code
    )
    VALUES ($1, $2, $3, $4, $5, 'anual', $6)
    RETURNING id;
  `,
    [
      tenantLabel,
      projectSupabaseUrl,
      anonKey,
      serviceRoleKey,
      SUPABASE_MANAGEMENT_TOKEN,
      tenantCode.toLowerCase(),
    ],
  );

  const newTenantId = insertTenantRes.rows[0].id;
  console.log(`✅ Tenant registrado no Admin com ID: ${newTenantId}`);

  console.log("📝 7. Registrando histórico de schemas...");
  for (const file of migrationFiles) {
    await adminDbClient.query(
      `
      INSERT INTO public.schema_migrations (tenant_id, migration_name, status)
      VALUES ($1, $2, 'success');
    `,
      [newTenantId, file],
    );
  }

  await adminDbClient.end();

  console.log(`\n🎉 PROJETO ${projectId} - ${projectRef} FINALIZADO E CONFIGURADO!`);
  console.log(
    `🔑 ADMIN LOGINS:\n   URL: ${projectSupabaseUrl}\n   Access: ${adminEmail} / ${adminPassword}`,
  );
  console.log("🌍 O Web reconhecerá esse cliente pela tenant-config assim que o registro central estiver disponível.\n");
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("\n❌ ERRO FATAL no Onboarding:", errorMessage);
  process.exit(1);
}
