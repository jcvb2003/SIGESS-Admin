import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Carrega variáveis de ambiente do .env da pasta Admin
dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_URL || !ADMIN_KEY) {
  console.error('❌ Erro: VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
  process.exit(1);
}

/**
 * Tabelas críticas para exportação lógica parcial
 */
const TABELAS_CRITICAS = [
  'socios',
  'reap',
  'requerimentos',
  'financeiro_lancamentos',
  'financeiro_cobrancas_geradas',
  'financeiro_dae',
  'financeiro_historico_regime',
  'financeiro_config_socio',
  'localidades',
  'templates',
  'configuracao_entidade',
  'parametros',
  'logs_eventos_requerimento',
  'audit_log_financeiro',
];

/**
 * Registra o status de uma exportação na tabela export_runs
 */
async function logExportRun(params: {
  adminClient: any;
  run_id: string;
  tenant: any;
  tabela: string;
  status: 'running' | 'success' | 'failed' | 'skipped';
  skip_reason?: string;
  file_path?: string;
  file_size_bytes?: number;
  checksum?: string;
  error_detail?: string;
}) {
  const { adminClient, run_id, tenant, tabela, status, skip_reason, file_path, file_size_bytes, checksum, error_detail } = params;
  
  const { error } = await adminClient.from('export_runs').upsert({
    run_id,
    tenant_id: tenant.id,
    tenant_code: tenant.tenant_code,
    tenant_name: tenant.nome_entidade,
    tabela,
    status,
    skip_reason,
    file_path,
    file_size_bytes,
    checksum,
    error_detail,
    executed_at: new Date().toISOString()
  }, { 
    onConflict: 'run_id,tenant_code,tabela' 
  });

  if (error) {
    console.error(`   ⚠️ Erro ao registrar log em export_runs (${tabela}):`, error.message);
  }
}

/**
 * Realiza o export lógico de um tenant para o Storage do Admin
 */
async function exportTenantData(tenant: any, adminClient: any, run_id: string) {
  console.log(`\n⏳ Iniciando export operacional: ${tenant.tenant_code} (${tenant.nome_entidade})...`);
  
  // Conecta ao tenant via PostgREST com service_role
  const tenantClient = createClient(tenant.supabase_url, tenant.supabase_secret_keys);
  const today = new Date().toISOString().split('T')[0];

  for (const tabela of TABELAS_CRITICAS) {
    try {
      console.log(`   ➡ Processando ${tabela}...`);
      
      // Registrar início
      await logExportRun({ adminClient, run_id, tenant, tabela, status: 'running' });

      let allData: any[] = [];
      let start = 0;
      const CHUNK_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        // Tenta ordenar por 'id' ou 'created_at' para garantir estabilidade na paginação
        const orderBy = ['socios', 'requerimentos', 'financeiro_lancamentos'].includes(tabela) ? 'id' : 'created_at';
        
        let { data, error } = await tenantClient
          .from(tabela)
          .select('*')
          .range(start, start + CHUNK_SIZE - 1)
          .order(orderBy, { ascending: true, nullsFirst: false });

        // Se falhar (ex: coluna id não existe), tenta o outro ou sem ordem
        if (error) {
           const secondTry = orderBy === 'id' ? 'created_at' : 'id';
           const { data: d2, error: e2 } = await tenantClient
             .from(tabela)
             .select('*')
             .range(start, start + CHUNK_SIZE - 1)
             .order(secondTry, { ascending: true, nullsFirst: false });
           
           if (e2) {
             // Fallback final: sem ordem (limite de 1000)
             const { data: d3, error: e3 } = await tenantClient.from(tabela).select('*').limit(CHUNK_SIZE);
             if (e3) throw new Error(`Erro na leitura PostgREST (${tabela}): ${e3.message}`);
             data = d3;
             hasMore = false; // Sem ordem não podemos paginar
           } else {
             data = d2;
           }
        }

        if (data) {
          allData.push(...data);
          if (hasMore) {
            hasMore = data.length === CHUNK_SIZE;
            start += CHUNK_SIZE;
          }
          
          if (start > 0 && start % 5000 === 0) {
            console.log(`     - Processados ${start} registros...`);
          }
        } else {
          hasMore = false;
        }
      }

      if (allData.length === 0) {
        console.log(`   ℹ Tabela ${tabela} está vazia, pulando export.`);
        await logExportRun({ 
          adminClient, run_id, tenant, tabela, 
          status: 'skipped', 
          skip_reason: 'empty_table' 
        });
        continue;
      }

      console.log(`   📦 Serializando ${allData.length} registros...`);
      const jsonl = allData.map(row => JSON.stringify(row)).join('\n');
      const buffer = Buffer.from(jsonl);
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

      // Upload para Admin Storage
      const fileName = `${tabela}.jsonl`;
      const storagePath = `${tenant.tenant_code}/${today}/${fileName}`;
      
      console.log(`   📤 Fazendo upload de ${sizeMB} MB...`);
      const { error: uploadErr } = await adminClient.storage
        .from('backups')
        .upload(storagePath, buffer, {
          contentType: 'application/x-ndjson',
          upsert: true
        });

      if (uploadErr) {
        throw new Error(`Erro no upload Storage: ${uploadErr.message}`);
      }

      console.log(`   ✅ Sucesso: ${fileName} | Checksum: ${checksum.slice(0, 8)}`);
      await logExportRun({ 
        adminClient, run_id, tenant, tabela, 
        status: 'success',
        file_path: storagePath,
        file_size_bytes: buffer.length,
        checksum
      });

    } catch (err: any) {
      console.error(`   ❌ Falha na tabela ${tabela}:`, err.message);
      await logExportRun({ 
        adminClient, run_id, tenant, tabela, 
        status: 'failed',
        error_detail: err.message
      });
    }
  }
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const targetTenant = args.find(a => a.startsWith('--tenant='))?.split('=')[1];

if (!all && !targetTenant) {
  console.log(`
🚀 SIGESS Operational Export (JSONL)

Uso:
  npm run export:tenant -- --tenant=<codigo>   Exporta dados de um tenant específico
  npm run export:all                            Exporta dados de todos os tenants registrados
  
Nota: Este script realiza um export lógico parcial para fins de auditoria e recuperação rápida.
Não substitui o backup físico do PostgreSQL (pg_dump).
  `);
  process.exit(1);
}

const adminClient = createClient(ADMIN_URL, ADMIN_KEY);
const run_id = crypto.randomUUID();

(async () => {
  try {
    console.log(`📦 Iniciando Ciclo de Exportação | Run ID: ${run_id}`);
    console.log('📦 Carregando tenants do banco Admin...');
    
    // Busca tenants registrados
    const { data: entidades, error } = await adminClient
      .from('entidades')
      .select('id, tenant_code, nome_entidade, supabase_url, supabase_secret_keys')
      .order('tenant_code');

    if (error) {
      console.error('❌ Erro ao buscar entidades:', error.message);
      process.exit(1);
    }

    const tenantsToProcess = all 
      ? entidades 
      : entidades.filter((e: any) => e.tenant_code === targetTenant);

    if (!tenantsToProcess || tenantsToProcess.length === 0) {
      console.error(`❌ Nenhum tenant correspondente encontrado para: ${targetTenant || 'all'}`);
      process.exit(1);
    }

    console.log(`🚀 Iniciando exportação para ${tenantsToProcess.length} tenants...`);

    for (const tenant of tenantsToProcess) {
      await exportTenantData(tenant, adminClient, run_id);
    }

    console.log(`\n✅ Ciclo de exportação finalizado | Run ID: ${run_id}`);

  } catch (error) {
    console.error('\n💥 Erro fatal na rotina:', error);
    process.exit(1);
  }
})();
