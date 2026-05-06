import { createClient } from '@supabase/supabase-js';
import { propagateFromOeiras, TenantConfig } from '../src/shared/propagate';
import * as dotenv from 'dotenv';
import path from 'path';

// Carrega variáveis de ambiente do .env da pasta Admin
dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_URL || !ADMIN_KEY) {
  console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
  console.log('Certifique-se de que está rodando o comando de dentro da pasta Admin.');
  process.exit(1);
}

const args = process.argv.slice(2);

// Ajuda / Help
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
🚀 SIGESS Migration Propagator (v3)

Uso:
  npm run migrate:tenant -- --tenant=<codigo>   Aplica em um tenant específico
  npm run migrate:all                           Aplica em todos os tenants registrados
  
Opções:
  --tenant=<code>            Código do tenant (ex: z2, sinpesca-breves)
  --all                      Processa todos os tenants que possuem token de acesso
  --dry-run                  Simula a operação e lista o que seria aplicado
  --from-version=<version>   Aplica apenas migrations a partir desta versão (inclusive)
  --help, -h                 Exibe esta ajuda
  `);
  process.exit(args.length === 0 ? 1 : 0);
}

const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const targetTenant = args.find(a => a.startsWith('--tenant='))?.split('=')[1];
const fromVersion = args.find(a => a.startsWith('--from-version='))?.split('=')[1];

if (!all && !targetTenant) {
  console.error('❌ Erro: Você deve especificar --all ou --tenant=<code>');
  process.exit(1);
}

const adminClient = createClient(ADMIN_URL, ADMIN_KEY);

(async () => {
  try {
    console.log('📦 Carregando catálogo de tenants do banco Admin...');
    
    // Busca tenants que possuem token de acesso configurado
    const { data: entidades, error } = await adminClient
      .from('entidades')
      .select('id, nome_entidade, tenant_code, supabase_url, supabase_secret_keys, supabase_access_token')
      .not('supabase_access_token', 'is', null)
      .order('nome_entidade');

    if (error) {
      console.error('❌ Erro ao buscar entidades no banco Admin:', error.message);
      process.exit(1);
    }

    if (!entidades || entidades.length === 0) {
      console.warn('⚠️ Nenhum tenant com token de acesso (PAT) encontrado no banco.');
      process.exit(0);
    }

    // Identifica o tenant de referência (OEIRAS)
    const oeirasData = entidades.find(e => e.tenant_code === 'sinpesca-oeiras');
    if (!oeirasData) {
      console.error('❌ Erro: Tenant de referência "sinpesca-oeiras" não encontrado no banco ou está sem PAT.');
      process.exit(1);
    }

    const oeiras: TenantConfig = {
      id: oeirasData.tenant_code,
      url: oeirasData.supabase_url,
      serviceKey: oeirasData.supabase_secret_keys,
      managementToken: oeirasData.supabase_access_token,
    };

    // Mapeia os tenants para o formato esperado pelo serviço de propagação
    const tenants: TenantConfig[] = entidades.map(e => ({
      id: e.tenant_code,
      url: e.supabase_url,
      serviceKey: e.supabase_secret_keys,
      managementToken: e.supabase_access_token,
    }));

    console.log(`✅ ${tenants.length} tenants prontos para auditoria (Referência: ${oeiras.id})`);

    // Inicia a propagação
    const results = await propagateFromOeiras({
      oeiras,
      tenants,
      targetTenant,
      dryRun,
      fromVersion,
    }, adminClient);

    // Relatório final resumido
    console.log('\n📊 Resumo da Operação:');
    console.log('--------------------------------------------------');
    results.forEach(r => {
      const statusIcon = r.failed ? '❌' : (r.applied.length > 0 ? '✅' : '✔');
      const statusText = r.failed ? 'FALHA' : (r.applied.length > 0 ? 'APLICADO' : 'SYNC');
      
      console.log(`${statusIcon} [${r.tenant.padEnd(15)}] Status: ${statusText.padEnd(8)} | Aplicadas: ${r.applied.length} | Puladas: ${r.skipped.length} | Bloqueadas: ${r.blocked.length}`);
      
      if (r.failed) {
        console.log(`   └─ 🛑 Erro na versão ${r.failed}: ${r.error}`);
      }
      if (r.blocked.length > 0) {
        console.log(`   └─ ⚠️ Migrations bloqueadas pelo gate: ${r.blocked.join(', ')}`);
      }
    });
    console.log('--------------------------------------------------');

    if (dryRun) {
      console.log('\n💡 Esta foi uma simulação (--dry-run). Nenhuma alteração foi feita nos tenants.');
    }

  } catch (error) {
    console.error('\n💥 Erro fatal na execução do script:', error);
    process.exit(1);
  }
})();
