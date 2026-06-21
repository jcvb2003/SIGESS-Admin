import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;


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

function extractGrants(sql: string): string {
  // Apenas privilégios funcionais do app.
  // USAGE excluído: sem caso real confirmado no baseline.
  // REVOKE excluído por decisão explícita: onboarding só concede;
  // Schema Sync é responsável por normalizar (revogar + reaplicar) quando necessário.
  // ALTER DEFAULT PRIVILEGES excluído: requer permissões elevadas não disponíveis via Management API.
  const FUNCTIONAL = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE']);
  const APP_ROLES = new Set(['anon', 'authenticated', 'service_role']);

  const result: string[] = [];

  for (const line of sql.split('\n')) {
    const t = line.trim();

    if (!/^GRANT /i.test(t)) continue;

    // Verificar se ao menos um role do app está na cláusula TO
    // pg_dump pode citar nomes com aspas (ex: "service_role") — normalizar antes de comparar
    const toMatch = t.match(/\bTO\s+(.+?)\s*;?\s*$/i);
    if (!toMatch) continue;
    const roles = toMatch[1].split(',').map(r => r.trim().toLowerCase().replace(/['"]/g, ''));
    if (!roles.some(r => APP_ROLES.has(r))) continue;

    // Extrair lista de privilégios (entre "GRANT " e " ON ")
    const privMatch = t.match(/^GRANT\s+(.+?)\s+ON\s+/i);
    if (!privMatch) continue;

    const rawPrivs = privMatch[1].trim().toUpperCase();

    // pg_dump usa ALL para service_role e outros roles — expandir para subset funcional por tipo
    if (rawPrivs === 'ALL' || rawPrivs === 'ALL PRIVILEGES') {
      const isFunction = /\bON\s+FUNCTION\b/i.test(t);
      const isSequence = /\bON\s+SEQUENCE\b/i.test(t);
      const isSchema   = /\bON\s+SCHEMA\b/i.test(t);

      // Schemas e sequences: pular — acesso é implícito ou gerenciado fora do grants.sql
      if (isSchema || isSequence) continue;

      // Funções: ALL = EXECUTE. Tabelas/views: manter ALL — com REVOKE antes do replay,
      // o estado é limpo e ALL reflete exatamente o contrato canônico do MARANHAO.
      if (isFunction) {
        result.push(t.replace(/\bALL(\s+PRIVILEGES)?\b/i, 'EXECUTE'));
      } else {
        result.push(t); // GRANT ALL ON TABLE ... — preservar literal
      }
      continue;
    }

    const allPrivs = rawPrivs.split(',').map(p => p.trim());
    const functionalPrivs = allPrivs.filter(p => FUNCTIONAL.has(p));

    if (functionalPrivs.length === 0) continue;

    if (functionalPrivs.length === allPrivs.length) {
      result.push(t);
    } else {
      // Reconstruir statement com apenas os privilégios funcionais
      result.push(t.replace(privMatch[1], functionalPrivs.join(', ')));
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function updateInitialSchema() {
  const args = process.argv.slice(2);
  const promote = args.includes('--promote');

  if (!ADMIN_URL || !ADMIN_KEY) {
    console.error('Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY nao definidos');
    process.exit(1);
  }

  console.log('Lendo baseline_database_url do banco Admin...');
  const adminClient = createClient(ADMIN_URL, ADMIN_KEY);
  const { data: setting, error: settingError } = await adminClient
    .from('system_settings')
    .select('value')
    .eq('key', 'baseline_database_url')
    .maybeSingle();

  if (settingError) {
    console.error('Erro ao ler system_settings do banco Admin:', settingError.message);
    process.exit(1);
  }

  if (!setting?.value || setting.value === '••••••••') {
    console.error('Erro: baseline_database_url nao configurado no banco Admin.');
    console.error('Configure em: Admin > Configuracoes > Governanca — Baseline de Schema');
    process.exit(1);
  }

  const BASELINE_DB_URL = setting.value;

  try {
    console.log('Gerando dump do schema baseline...');

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

    // Gerar e promover grants.sql
    console.log('\nGerando grants canonicos...');
    const grantsCommand = [
      `pg_dump "${BASELINE_DB_URL}"`,
      '--schema-only',
      '--no-owner',
      '--no-comments',
      '--schema=public',
    ].join(' ');

    const rawGrants = execSync(grantsCommand, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });
    const grantsSql = extractGrants(rawGrants);

    if (!grantsSql.trim()) {
      console.warn('Aviso: nenhum grant extraido. Verifique o filtro extractGrants.');
    } else {
      const grantsBuffer = Buffer.from(grantsSql);
      const { error: grantsError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload('grants.sql', grantsBuffer, { upsert: true, contentType: 'text/plain' });
      if (grantsError) throw new Error(`Erro ao subir grants.sql: ${grantsError.message}`);
      console.log(`grants.sql gerado (${(grantsSql.length / 1024).toFixed(2)} KB)`);
    }

    console.log('\nSucesso! O novo onboarding usara este schema como base.');
  } catch (error: any) {
    console.error('\nFalha ao atualizar schema:', error.message);
    process.exit(1);
  }
}

updateInitialSchema();
