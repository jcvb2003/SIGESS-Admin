import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

// Carrega variaveis de ambiente do .env da pasta Admin
dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const OEIRAS_DB_URL = process.env.OEIRAS_DATABASE_URL;

if (!ADMIN_URL || !ADMIN_KEY) {
  console.error('Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY nao definidos no .env');
  process.exit(1);
}

if (!OEIRAS_DB_URL) {
  console.error('Erro: OEIRAS_DATABASE_URL nao definido no .env');
  console.log('Exemplo: OEIRAS_DATABASE_URL=postgresql://postgres:[PASSWORD]@db.tnrzxuznerneilxoojgv.supabase.co:5432/postgres');
  process.exit(1);
}

const CANDIDATE_FILE = 'initial_schema_candidate.sql';
const OFFICIAL_FILE = 'initial_schema.sql';
const BUCKET_NAME = 'migrations';

function sanitizeInitialSchema(sql: string) {
  const cleanedSql = sql
    .replace(/^CREATE SCHEMA public;\s*$/gim, '')
    .replace(/^CREATE SCHEMA IF NOT EXISTS public;\s*$/gim, '')
    .replace(/^ALTER SCHEMA public OWNER TO .*?;\s*$/gim, '')
    .replace(/^COMMENT ON SCHEMA public IS .*?;\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const needsPgTrgm =
    cleanedSql.includes('public.gin_trgm_ops') &&
    !/CREATE EXTENSION IF NOT EXISTS pg_trgm/i.test(cleanedSql);

  if (!needsPgTrgm) {
    return cleanedSql;
  }

  return `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;\n\n${cleanedSql}`;
}

async function updateInitialSchema() {
  const args = process.argv.slice(2);
  const promote = args.includes('--promote');

  try {
    console.log('Gerando dump do schema de Oeiras...');

    // --schema-only: apenas estrutura
    // --no-owner: remove comandos de owner
    // --no-privileges: remove GRANTs, pois o onboarding aplica os seus proprios
    // --schema=public: foca apenas no dominio do sistema
    const dumpCommand = `pg_dump "${OEIRAS_DB_URL}" --schema-only --no-owner --no-privileges --schema=public`;
    const dump = execSync(dumpCommand, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });

    console.log('Limpando metadados de migracoes e extensoes desnecessarias...');

    const blocks = dump.split(/\n\s*\n/);
    const cleanedBlocks = blocks.filter((block) => {
      const lowerBlock = block.toLowerCase();
      const isMigrationBlock =
        lowerBlock.includes('_migrations') ||
        lowerBlock.includes('supabase_migrations');

      return !isMigrationBlock;
    });

    const finalSql = sanitizeInitialSchema(
      cleanedBlocks
        .join('\n\n')
        .split('\n')
        .filter((line) => !line.trim().startsWith('\\'))
        .join('\n')
        .replace(/--.*$/gm, '')
        .replace(/\n\s*\n/g, '\n\n')
        .trim()
    );

    if (finalSql.length < 5000) {
      throw new Error(`Schema gerado parece muito curto (${finalSql.length} bytes). Verifique a conexao.`);
    }

    fs.writeFileSync(CANDIDATE_FILE, finalSql);
    console.log(`Candidato gerado: ${CANDIDATE_FILE} (${(finalSql.length / 1024).toFixed(2)} KB)`);

    if (!promote) {
      console.log('\nPara promover este candidato a schema oficial e subir para o Storage, use:');
      console.log('   npm run schema:update-initial -- --promote');
      return;
    }

    console.log(`\nPromovendo para ${OFFICIAL_FILE} e subindo para o bucket "${BUCKET_NAME}"...`);

    const supabase = createClient(ADMIN_URL, ADMIN_KEY);

    const { error: candidateError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(CANDIDATE_FILE, Buffer.from(finalSql), { upsert: true, contentType: 'text/plain' });

    if (candidateError) {
      throw new Error(`Erro ao subir candidato: ${candidateError.message}`);
    }

    const { error: officialError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(OFFICIAL_FILE, Buffer.from(finalSql), { upsert: true, contentType: 'text/plain' });

    if (officialError) {
      throw new Error(`Erro ao subir oficial: ${officialError.message}`);
    }

    console.log('\nSucesso! O novo onboarding usara este schema como base.');
  } catch (error: any) {
    console.error('\nFalha ao atualizar schema:', error.message);
    process.exit(1);
  }
}

updateInitialSchema();
