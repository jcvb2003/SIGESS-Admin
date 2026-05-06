import { createClient } from '@supabase/supabase-js';
import { auditAllEdgeFunctions } from '../src/services/edge-functions.service';
import * as dotenv from 'dotenv';
import path from 'path';

// Carrega variáveis de ambiente
dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_URL || !ADMIN_KEY) {
  console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
  process.exit(1);
}

const adminClient = createClient(ADMIN_URL, ADMIN_KEY);

(async () => {
  try {
    console.log('🚀 Iniciando Auditoria Global de Edge Functions...');
    console.log('--------------------------------------------------');

    const results = await auditAllEdgeFunctions(adminClient);

    console.log('\n📊 Resumo da Auditoria:');
    console.log('--------------------------------------------------');

    const summary = results.reduce((acc: any, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    results.forEach(r => {
      const icon = r.status === 'synced' ? '✅' : (r.status === 'missing' ? '🚫' : '⚠️');
      console.log(`${icon} [${r.tenant.padEnd(15)}] ${r.function_slug.padEnd(20)} | Status: ${r.status.padEnd(8)} | vRef: ${r.reference_version} | vTenant: ${r.current_version ?? 'N/A'}`);
    });

    console.log('--------------------------------------------------');
    console.log(`✅ Concluído: ${results.length} auditorias realizadas.`);
    console.log(`📈 Sincronizadas: ${summary.synced || 0} | Defasadas: ${summary.outdated || 0} | Ausentes: ${summary.missing || 0}`);

  } catch (error) {
    console.error('\n💥 Erro fatal na rotina de auditoria:', error);
    process.exit(1);
  }
})();
