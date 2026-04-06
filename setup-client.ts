import * as fs from 'node:fs';
import * as path from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

// Uso: npx ts-node setup-client.ts --project-id=XXXXX --project-ref=YYYYY --admin-email=teste@teste.com --tenant-code=z2 --tenant-label="Colônia Z-2" --vercel-project-id=prj_xxx --vercel-token=xxx

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const val = args.find((a) => a.startsWith(`--${name}=`));
  return val ? val.split('=')[1] : null;
};

const projectId = getArg('project-id');
const projectRef = getArg('project-ref');
const adminEmail = getArg('admin-email');
const adminPassword = getArg('admin-password') || 'Mudar@1234'; // Senha temporária para acesso inicial

const tenantCode = getArg('tenant-code');
const tenantLabel = getArg('tenant-label');
const vercelProjectId = getArg('vercel-project-id') || process.env.VERCEL_PROJECT_ID;
const vercelToken = getArg('vercel-token') || process.env.VERCEL_TOKEN;

// Cores opcionais
const corPrimaria = getArg('cor-primaria') || '160 84% 39%';
const corSecundaria = getArg('cor-secundaria') || '152 69% 41%';

if (!projectId || !projectRef || !adminEmail || !tenantCode || !tenantLabel || !vercelProjectId || !vercelToken) {
  console.error('❌ Parâmetros obrigatórios faltando: --project-id, --project-ref, --admin-email, --tenant-code, --tenant-label, --vercel-project-id, --vercel-token');
  process.exit(1);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const ADMIN_DB_URL = process.env.ADMIN_DB_URL; // String de conexão do banco Admin (onde fica a tabela entidades)

if (!RESEND_API_KEY || !SUPABASE_MANAGEMENT_TOKEN || !ADMIN_DB_URL) {
  console.error('❌ Variáveis de ambiente RESEND_API_KEY, SUPABASE_MANAGEMENT_TOKEN e ADMIN_DB_URL são obrigatórias no .env');
  process.exit(1);
}

console.log(`\n🚀 Iniciando configuração do Sindicato via Supabase API (Ref: ${projectRef})...`);

try {
  // 1. Buscar anon_key + service_role_key
  console.log('🔑 1. Buscando chaves da API...');
  const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: { 'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}` }
  });
  if (!keysRes.ok) throw new Error(`Falha ao buscar chaves: ${await keysRes.text()}`);
  
  const keys = await keysRes.json();
  const anonKeyObj = keys.find((k: any) => k.name === 'anon');
  const serviceRoleKeyObj = keys.find((k: any) => k.name === 'service_role');
  
  if (!anonKeyObj || !serviceRoleKeyObj) throw new Error('Chaves anon ou service_role não encontradas na API.');
  
  const anonKey = anonKeyObj.api_key;
  const serviceRoleKey = serviceRoleKeyObj.api_key;
  const projectSupabaseUrl = `https://${projectRef}.supabase.co`;

  // 2. Configura SMTP e Auth URLs
  console.log('📧 2. Configurando SMTP Resend e URLs de Redirecionamento de Auth...');
  const authRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      site_url: 'https://app.sigess.com.br/password',
      uri_allow_list: 'https://app.sigess.com.br/**,https://app.sigess.com.br/password',
      smtp_admin_email: 'noreply@sigess.com.br',
      smtp_host: 'smtp.resend.com',
      smtp_port: 465,
      smtp_user: 'resend',
      smtp_pass: RESEND_API_KEY,
      smtp_sender_name: 'SIGESS',
      smtp_enabled: true,
    }),
  });

  if (!authRes.ok) throw new Error(`Falha na configuração do Auth/SMTP: ${authRes.status}`);
  console.log('✅ SMTP e URLs configurados.');

  // 3. Aplicar migrations via Management API
  console.log('⚙️  3. Aplicando Migrations SQL via Management API...');
  const queryApiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const runQuery = async (query: string) => {
    const res = await fetch(queryApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || 'Erro ao executar query');
    }
  };

  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of migrationFiles) {
    console.log(`   ➡️ Aplicando ${file}...`);
    const sqlContent = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await runQuery(sqlContent);
  }

  // 4. Aplicar seed via Management API
  console.log('🌱 4. Aplicando Seed de dados...');
  const seedPath = path.resolve(process.cwd(), 'supabase', 'functions', 'client-proxy', 'seed.ts');
  const seedFileContent = fs.readFileSync(seedPath, 'utf8');
  const seedContentMatch = seedFileContent.match(/const seedSql = `([\s\S]*?)`;/);
  const seedContent = seedContentMatch ? seedContentMatch[1] : '';
  
  if (seedContent) {
    await runQuery(seedContent);
    console.log('✅ Migrations e Seed injetados.');
  } else {
    console.warn('⚠️ Bloco de Seed Sql não localizado no arquivo seed.ts');
  }

  // 5. Aguardar e Promover o usuário admin (Opção A)
  console.log('👤 5. Promovendo usuário Admin (Opção A)...');
  const supabaseClient = createClient(projectSupabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Criar o usuário no Auth (isso dispara o trigger on_auth_user_created e popula public."User")
  const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true
  });

  if (authError || !authData.user) {
    console.warn(`⚠️ Aviso: Falha ao criar usuário no Auth (${authError?.message}). Pode já existir.`);
  }

  // Aguardar o insert via trigger do Postgres (repetidores curtos)
  let adminUserId = null;
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const { data: publicUser } = await supabaseClient
      .from('User')
      .select('id')
      .eq('email', adminEmail)
      .single();
    
    if (publicUser) {
      adminUserId = publicUser.id;
      break;
    }
  }

  if (adminUserId) {
    const { error: promoteError } = await supabaseClient
      .from('User')
      .update({ role: 'admin' })
      .eq('id', adminUserId);
    
    if (promoteError) {
      console.warn('⚠️ Falha ao atualizar role para admin:', promoteError.message);
    } else {
      console.log('✅ Usuário promovido a admin com sucesso.');
    }
  } else {
    console.warn('⚠️ Não foi possível encontrar/promover o usuário na tabela public.User. O trigger pode ter falhado ou demorado muito.');
  }

  // Bonus: Alterar os dados da entidade inicial da Seed (Placeholder)
  await supabaseClient.from('entidade').update({
    nome_entidade: tenantLabel,
    nome_abreviado: tenantCode.toUpperCase(),
    cor_primaria: corPrimaria,
    cor_secundaria: corSecundaria
  }).neq('id', '00000000-0000-0000-0000-000000000000'); 

  // 6. Registrar na tabela entidades do Admin Panel
  console.log('🏢 6. Registrando tenant no Admin Panel...');
  const { Client } = pg;
  const adminDbClient = new Client({ connectionString: ADMIN_DB_URL });
  await adminDbClient.connect();

  const insertTenantRes = await adminDbClient.query(`
    INSERT INTO public.entidades (nome_entidade, supabase_url, supabase_publishable_key, supabase_secret_keys, supabase_access_token, assinatura, tenant_code)
    VALUES ($1, $2, $3, $4, $5, 'anual', $6)
    RETURNING id;
  `, [
    tenantLabel, 
    projectSupabaseUrl, 
    anonKey, 
    serviceRoleKey, 
    SUPABASE_MANAGEMENT_TOKEN, 
    tenantCode.toLowerCase()
  ]);

  const newTenantId = insertTenantRes.rows[0].id;
  console.log(`✅ Tenant registrado no Admin com ID: ${newTenantId}`);

  // 7. Adicionar env vars no Vercel
  console.log(`🌐 7. Injetando Environment Variables no Vercel Project ID: ${vercelProjectId}...`);
  const addEnvVar = async (key: string, value: string) => {
    const envRes = await fetch(`https://api.vercel.com/v10/projects/${vercelProjectId}/env`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key,
        value,
        type: 'plain',
        target: ['production', 'preview']
      })
    });
    
    const status = envRes.status;
    if (!envRes.ok) {
      const errText = await envRes.text();
      // Ignorar erros se a variável já existir (ex: 400 bad request ou 409 conflict, variando com a API Vercel)
      if (errText.includes('already exists')) {
        console.warn(`⚠️ Env var ${key} já existia no vercel, ignorando inserção...`);
      } else {
        throw new Error(`Falha ao adicionar env var ${key} (Status ${status}): ${errText}`);
      }
    }
  };

  await addEnvVar(`VITE_SUPABASE_URL_${tenantCode.toUpperCase()}`, projectSupabaseUrl);
  await addEnvVar(`VITE_SUPABASE_ANON_KEY_${tenantCode.toUpperCase()}`, anonKey);
  console.log('✅ Env vars criadas.');

  // 8. Triggar redeploy no Vercel
  console.log('🔄 8. Disparando Redeploy no Vercel...');
  const deploymentsRes = await fetch(`https://api.vercel.com/v6/deployments?projectId=${vercelProjectId}&target=production&limit=1`, {
    headers: { 'Authorization': `Bearer ${vercelToken}` }
  });
  if (!deploymentsRes.ok) throw new Error(`Falha ao buscar deployments: ${await deploymentsRes.text()}`);
  
  const deployments = await deploymentsRes.json();
  const lastDeployment = deployments.deployments?.[0];

  if (lastDeployment && lastDeployment.uid) {
    const redeployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vercelToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deploymentId: lastDeployment.uid,
        name: lastDeployment.name || 'sigess', // usar nome do ultimo deploy dinâmico
        target: 'production'
      })
    });
    if (!redeployRes.ok) {
      console.warn(`⚠️ Aviso: Falha ao acionar redeploy: ${await redeployRes.text()}`);
    } else {
      console.log('✅ Redeploy disparado com sucesso.');
    }
  } else {
    console.warn('⚠️ Nenhum deployment prévio encontrado no Vercel. Você vai precisar aplicar o deploy primário manualmente.');
  }

  // 9. Registrar migrations aplicadas do Admin
  console.log('📝 9. Registrando histórico de schemas...');
  for (const file of migrationFiles) {
    await adminDbClient.query(`
      INSERT INTO public.schema_migrations (tenant_id, migration_name, status)
      VALUES ($1, $2, 'success');
    `, [newTenantId, file]);
  }
  console.log('✅ Histórico registrado.');

  await adminDbClient.end();

  console.log(`\n🎉 PROJETO ${projectId} - ${projectRef} FINALIZADO E TOTALMENTE CONFIGURADO!`);
  console.log(`🔑 ADMIN LOGINS (Opção A Executada):\n   URL: ${projectSupabaseUrl}\n   Access: ${adminEmail} / ${adminPassword}`);
  console.log(`🌍 O ambiente de produção online reconhecerá esse cliente assim que o Vercel terminar o deploy em instantes.\n`);

} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('\n❌ ERRO FATAL no Onboarding:', errorMessage);
  process.exit(1);
}
