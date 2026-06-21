import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Override local de emergência (legado). Fonte primária é agora o banco Admin.
// Mantidos apenas como escape se banco Admin não estiver acessível.
const ENV_DB_URL =
  process.env.MARANHAO_DATABASE_URL ??
  process.env.BASELINE_DATABASE_URL ??
  process.env.RAYSSA_DATABASE_URL;

const CANDIDATE_FILE = 'initial_schema_candidate.sql';
const OFFICIAL_FILE = 'initial_schema.sql';
const BUCKET_NAME = 'migrations';

// Objetos críticos que devem estar presentes no baseline
const REQUIRED_OBJECTS = [
  'is_tenant_owner',
  'check_member_limit',
  'tenants_select',
  'parametros_financeiros_select',
  'user_unit_memberships',
  'tenant_users',
  'get_finance_audit_log_v1',
];

// Padrões que não devem aparecer no baseline
const FORBIDDEN_PATTERNS: RegExp[] = [
  /schema_migrations/i,
  /supabase_migrations/i,
  /app_metadata.*role.*admin/i,
];

function sanitizeInitialSchema(sql: string): string {
  const cleaned = sql
    .replace(/^CREATE SCHEMA public;\s*$/gim, '')
    .replace(/^CREATE SCHEMA IF NOT EXISTS public;\s*$/gim, '')
    .replace(/^ALTER SCHEMA public OWNER TO .*?;\s*$/gim, '')
    .replace(/^COMMENT ON SCHEMA public IS .*?;\s*$/gim, '')
    .replace(/\bextensions\.gin_trgm_ops\b/g, 'public.gin_trgm_ops')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const needsPgTrgm =
    cleaned.includes('public.gin_trgm_ops') &&
    !/CREATE EXTENSION IF NOT EXISTS pg_trgm/i.test(cleaned);

  return needsPgTrgm
    ? `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;\n\n${cleaned}`
    : cleaned;
}

function validateSchema(sql: string): void {
  const errors: string[] = [];

  if (sql.length < 5000) {
    errors.push(`Schema muito curto (${sql.length} bytes) — dump provavelmente falhou`);
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(sql)) {
      errors.push(`Padrao proibido encontrado: ${pattern}`);
    }
  }

  for (const obj of REQUIRED_OBJECTS) {
    if (!sql.includes(obj)) {
      errors.push(`Objeto critico ausente: ${obj}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Validacao falhou:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

function showDiff(candidatePath: string, officialPath: string): void {
  if (!fs.existsSync(officialPath)) {
    console.log('Nenhum schema oficial existente para comparar.');
    return;
  }
  try {
    const diff = execSync(`git diff --no-index --stat "${officialPath}" "${candidatePath}"`, {
      encoding: 'utf-8',
    });
    console.log('\nDiff contra schema oficial:\n' + diff);
  } catch (e: any) {
    // git diff sai com codigo 1 quando ha diferencas — comportamento normal
    if (e.stdout) console.log('\nDiff contra schema oficial:\n' + e.stdout);
  }
}

async function updateInitialSchema() {
  const args = process.argv.slice(2);
  const promote = args.includes('--promote');

  if (!ADMIN_URL || !ADMIN_KEY) {
    console.error('Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY nao definidos');
    process.exit(1);
  }

  // Fonte primária: banco Admin (system_settings.baseline_database_url)
  let BASELINE_DB_URL = ENV_DB_URL ?? null;
  let dbSource = ENV_DB_URL ? 'variavel de ambiente (legado)' : null;

  if (!BASELINE_DB_URL) {
    console.log('Lendo baseline_database_url do banco Admin...');
    const adminClient = createClient(ADMIN_URL, ADMIN_KEY);
    const { data: setting, error } = await adminClient
      .from('system_settings')
      .select('value')
      .eq('key', 'baseline_database_url')
      .maybeSingle();

    if (error) {
      console.error('Erro ao ler system_settings do banco Admin:', error.message);
      process.exit(1);
    }

    if (!setting?.value || setting.value === '••••••••') {
      console.error('Erro: baseline_database_url nao configurado no banco Admin.');
      console.error('Configure em: Admin > Configuracoes > Governanca — Baseline de Schema');
      console.error('Alternativa emergencial: defina BASELINE_DATABASE_URL no .env local');
      process.exit(1);
    }

    BASELINE_DB_URL = setting.value;
    dbSource = 'banco Admin (system_settings.baseline_database_url)';
  }

  try {
    console.log(`Gerando dump do schema baseline a partir de: ${dbSource}...`);

    // --no-comments: remove cabecalhos de comentario gerados pelo pg_dump
    // --schema-only: apenas estrutura, sem dados
    // --no-owner: remove comandos de owner
    // --no-privileges: remove GRANTs (onboarding aplica os seus proprios)
    // --schema=public: foca apenas no dominio do sistema
    const dumpCommand = [
      `pg_dump "${BASELINE_DB_URL}"`,
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--no-comments',
      '--schema=public',
    ].join(' ');

    const dump = execSync(dumpCommand, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });

    console.log('Filtrando blocos de migracoes...');

    const blocks = dump.split(/\n\s*\n/);
    const filteredBlocks = blocks.filter((block) => {
      const lower = block.toLowerCase();
      return !lower.includes('_migrations') && !lower.includes('supabase_migrations');
    });

    const filtered = filteredBlocks
      .join('\n\n')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('\\') && !trimmed.startsWith('--');
      })
      .join('\n');

    const finalSql = sanitizeInitialSchema(filtered);

    console.log('Validando conteudo semantico...');
    validateSchema(finalSql);

    fs.writeFileSync(CANDIDATE_FILE, finalSql);
    console.log(`\nCandidato gerado: ${CANDIDATE_FILE} (${(finalSql.length / 1024).toFixed(2)} KB)`);

    showDiff(CANDIDATE_FILE, OFFICIAL_FILE);

    if (!promote) {
      console.log('\nRevisione o candidato e o diff acima. Para promover a schema oficial:');
      console.log('   npm run schema:update-initial -- --promote');
      return;
    }

    console.log(`\nPromovendo para ${OFFICIAL_FILE} e subindo para o bucket "${BUCKET_NAME}"...`);

    const supabase = createClient(ADMIN_URL, ADMIN_KEY);
    const buffer = Buffer.from(finalSql);

    const { error: candidateError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(CANDIDATE_FILE, buffer, { upsert: true, contentType: 'text/plain' });

    if (candidateError) throw new Error(`Erro ao subir candidato: ${candidateError.message}`);

    const { error: officialError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(OFFICIAL_FILE, buffer, { upsert: true, contentType: 'text/plain' });

    if (officialError) throw new Error(`Erro ao subir oficial: ${officialError.message}`);

    console.log('\nSucesso! O novo onboarding usara este schema como base.');
  } catch (error: any) {
    console.error('\nFalha ao atualizar schema:', error.message);
    process.exit(1);
  }
}

updateInitialSchema();
