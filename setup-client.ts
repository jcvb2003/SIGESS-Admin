import * as fs from 'node:fs';
import * as path from 'node:path';
import pg from 'pg';

// Uso: npx ts-node setup-client.ts --project-id=XXXXX --project-ref=YYYYY --admin-email=teste@teste.com --db-password=ZZZZZ

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const val = args.find((a) => a.startsWith(`--${name}=`));
  return val ? val.split('=')[1] : null;
};

const projectId = getArg('project-id');
const projectRef = getArg('project-ref');
const adminEmail = getArg('admin-email');
const dbPassword = getArg('db-password'); // Necessário para a ingestão direta de SQL se for usar cliente Postgres

if (!projectId || !projectRef || !adminEmail) {
  console.error('❌ Parâmetros obrigatórios faltando: --project-id, --project-ref, --admin-email');
  process.exit(1);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;

if (!RESEND_API_KEY || !SUPABASE_MANAGEMENT_TOKEN) {
  console.error('❌ Variáveis de ambiente RESEND_API_KEY e SUPABASE_MANAGEMENT_TOKEN são obrigatórias no .env');
  process.exit(1);
}

console.log(`\n🚀 Iniciando configuração do Sindicato via Supabase API (Ref: ${projectRef})...`);

try {
  // 1. Configura SMTP e Auth URLs em uma única chamada
  console.log('📧 1. Configurando SMTP Resend e URLs de Redirecionamento de Auth...');
  const authRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // -- Auth Configuration --
      site_url: 'https://app.sigess.com.br/password',
      uri_allow_list: 'https://app.sigess.com.br/**,https://app.sigess.com.br/password',
      
      // -- SMTP Configuration (Resend) --
      smtp_admin_email: 'noreply@sigess.com.br',
      smtp_host: 'smtp.resend.com',
      smtp_port: 465,
      smtp_user: 'resend',
      smtp_pass: RESEND_API_KEY,
      smtp_sender_name: 'SIGESS',
      smtp_enabled: true,
    }),
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    throw new Error(`Falha na configuração do Auth/SMTP: ${authRes.status} - ${errText}`);
  }
  console.log('✅ SMTP e URLs de Auth configurados com sucesso.');

  // 2. Roda o Schema SQL e Seed
  console.log('⚙️  2. Injetando Schema SQL e Seed de dados...');
  const sqlPath = path.resolve(process.cwd(), 'sigess_schema.sql');
  const seedPath = path.resolve(process.cwd(), 'seed.sql');

  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Arquivo sigess_schema.sql não encontrado na raiz: ${sqlPath}`);
  }
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Arquivo seed.sql não encontrado na raiz: ${seedPath}`);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  const seedContent = fs.readFileSync(seedPath, 'utf8');

  if (dbPassword) {
    const { Client } = pg;
    const dbUrl = `postgres://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    
    console.log('⏳ Executando Schema...');
    await client.query(sqlContent);
    
    console.log('🌱 Executando Seed de dados...');
    await client.query(seedContent);
    
    console.log('✅ Schema e Seed injetados com sucesso.');
    
    await client.end();
  } else {
    console.warn('⚠️  Não fornecido --db-password. Ignorando injeção SQL direta.');
  }

  console.log(`\n🎉 PROJETO ${projectId} - ${projectRef} finalizado e totalmente configurado!\n`);

} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('\n❌ ERRO FATAL no Onboarding:', errorMessage);
  process.exit(1);
}
