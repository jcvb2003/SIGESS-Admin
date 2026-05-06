import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

// Carrega variáveis de ambiente do .env da pasta Admin
dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const OEIRAS_DB_URL = process.env.OEIRAS_DATABASE_URL;

if (!ADMIN_URL || !ADMIN_KEY) {
  console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
  process.exit(1);
}

if (!OEIRAS_DB_URL) {
  console.error('❌ Erro: OEIRAS_DATABASE_URL não definido no .env');
  console.log('Exemplo: OEIRAS_DATABASE_URL=postgresql://postgres:[PASSWORD]@db.tnrzxuznerneilxoojgv.supabase.co:5432/postgres');
  process.exit(1);
}

const CANDIDATE_FILE = 'initial_schema_candidate.sql';
const OFFICIAL_FILE = 'initial_schema.sql';
const BUCKET_NAME = 'migrations';

async function updateInitialSchema() {
  const args = process.argv.slice(2);
  const promote = args.includes('--promote');

  try {
    console.log('🔍 Gerando dump do schema de Oeiras...');
    
    // 1. Gerar dump bruto via pg_dump
    // --schema-only: apenas estrutura
    // --no-owner: remove comandos de owner
    // --no-privileges: remove GRANTs (onboarding faz seus próprios grants)
    // --schema=public: foca apenas no domínio do sistema, evitando conflitos com auth/storage internos
    const dumpCommand = `pg_dump "${OEIRAS_DB_URL}" --schema-only --no-owner --no-privileges --schema=public`;
    let dump = execSync(dumpCommand, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });

    console.log('🧹 Limpando metadados de migrações e extensões desnecessárias...');

    // 2. Remover blocos relacionados a _migrations
    // pg_dump separa objetos por comentários e múltiplas quebras de linha
    const blocks = dump.split(/\n\s*\n/);
    const cleanedBlocks = blocks.filter(block => {
      const lowerBlock = block.toLowerCase();
      // Remove blocos que criam ou alteram tabelas de migração
      const isMigrationBlock = lowerBlock.includes('_migrations') || 
                               lowerBlock.includes('supabase_migrations');
      return !isMigrationBlock;
    });

    const finalSql = cleanedBlocks.join('\n\n')
      .split('\n')
      .filter(line => !line.trim().startsWith('\\')) // Remove comandos \restrict e outros do pooler/psql
      .join('\n')
      .replace(/--.*$/gm, '') // Remove comentários de linha remanescentes
      .replace(/\n\s*\n/g, '\n\n') // Normaliza espaços vazios
      .trim();

    // Validação básica
    if (finalSql.length < 5000) {
      throw new Error(`Schema gerado parece muito curto (${finalSql.length} bytes). Verifique a conexão.`);
    }

    // 3. Salvar localmente
    fs.writeFileSync(CANDIDATE_FILE, finalSql);
    console.log(`✅ Candidato gerado: ${CANDIDATE_FILE} (${(finalSql.length / 1024).toFixed(2)} KB)`);

    if (!promote) {
      console.log('\n💡 Para promover este candidato a schema oficial e subir para o Storage, use:');
      console.log('   npm run schema:update-initial -- --promote');
      return;
    }

    // 4. Promoção (Upload para Storage)
    console.log(`\n🚀 Promovendo para ${OFFICIAL_FILE} e subindo para o bucket "${BUCKET_NAME}"...`);
    
    const supabase = createClient(ADMIN_URL, ADMIN_KEY);

    // Upload Candidato
    const { error: err1 } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(CANDIDATE_FILE, Buffer.from(finalSql), { upsert: true, contentType: 'text/plain' });

    if (err1) throw new Error(`Erro ao subir candidato: ${err1.message}`);

    // Upload Oficial
    const { error: err2 } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(OFFICIAL_FILE, Buffer.from(finalSql), { upsert: true, contentType: 'text/plain' });

    if (err2) throw new Error(`Erro ao subir oficial: ${err2.message}`);

    console.log(`\n✨ Sucesso! O novo onboarding usará este schema como base.`);

  } catch (error: any) {
    console.error('\n❌ Falha ao atualizar schema:', error.message);
    process.exit(1);
  }
}

updateInitialSchema();
