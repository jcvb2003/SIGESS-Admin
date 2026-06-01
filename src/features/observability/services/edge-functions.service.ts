import { createClient } from '@supabase/supabase-js';
import { listEdgeFunctions, extractProjectRef, EdgeFunctionInfo } from '@/shared/supabase-management';

export type EdgeFunctionAuditResult = {
  tenant: string;
  function_slug: string;
  status: 'synced' | 'outdated' | 'missing' | 'unknown';
  reference_version: number;
  current_version: number | null;
}

/**
 * Realiza a auditoria de todas as Edge Functions em todos os tenants registrados,
 * comparando-as com as versões presentes no tenant de referência (Rayssa).
 */
export async function auditAllEdgeFunctions(
  adminClient: ReturnType<typeof createClient>
): Promise<EdgeFunctionAuditResult[]> {
  
  // 1. Carrega o projeto de referência (Rayssa/sinpesca) separadamente
  const { data: refEntidade, error: refErr } = await adminClient
    .from('projetos')
    .select('id, tenant_code, supabase_url, supabase_access_token')
    .eq('tenant_code', 'sinpesca')
    .not('supabase_access_token', 'is', null)
    .maybeSingle();

  if (refErr) throw refErr;
  if (!refEntidade) {
    throw new Error('Impossível realizar auditoria: Projeto de referência (sinpesca/Rayssa) não encontrado ou sem PAT.');
  }

  // 2. Carrega todos os projetos isolated que possuem PAT
  const { data: entidades, error: eErr } = await adminClient
    .from('projetos')
    .select('id, tenant_code, supabase_url, supabase_access_token')
    .not('topology', 'like', 'shared%')
    .not('supabase_access_token', 'is', null);

  if (eErr) throw eErr;

  console.log(`🔍 Obtendo funções de referência em Rayssa...`);
  const refRef = extractProjectRef(refEntidade.supabase_url);
  const refFunctions = await listEdgeFunctions(refRef, refEntidade.supabase_access_token);

  const auditResults: EdgeFunctionAuditResult[] = [];

  // 3. Itera sobre cada tenant para auditar disparidades
  for (const tenant of entidades) {
    if (tenant.tenant_code === 'sinpesca') continue;

    console.log(`   ➡ Auditando tenant: ${tenant.tenant_code}...`);
    const tenantRef = extractProjectRef(tenant.supabase_url);
    
    try {
      const tenantFunctions = await listEdgeFunctions(tenantRef, tenant.supabase_access_token);
      
      for (const refFn of refFunctions) {
        const currentFn = tenantFunctions.find(f => f.slug === refFn.slug);
        
        let status: 'synced' | 'outdated' | 'missing' = 'synced';
        
        if (!currentFn) {
          status = 'missing';
        } else if (currentFn.version !== refFn.version) {
          status = 'outdated';
        }

        const auditData = {
          tenant_id: tenant.id,
          function_slug: refFn.slug,
          reference_version: refFn.version,
          current_version: currentFn?.version || null,
          verify_jwt_reference: refFn.verify_jwt,
          verify_jwt_current: currentFn?.verify_jwt ?? null,
          status,
          last_checked_at: new Date().toISOString()
        };

        // 4. Salva o resultado no banco Admin para visualização na UI
        const { error: upsertErr } = await adminClient
          .from('edge_function_audits')
          .upsert(auditData, { onConflict: 'tenant_id,function_slug' });

        if (upsertErr) {
          console.error(`      ❌ Erro ao salvar auditoria de ${refFn.slug}:`, upsertErr.message);
        }

        auditResults.push({
          tenant: tenant.tenant_code,
          function_slug: refFn.slug,
          status,
          reference_version: refFn.version,
          current_version: currentFn?.version || null
        });
      }
    } catch (err: any) {
      console.error(`   ❌ Falha ao listar funções do tenant ${tenant.tenant_code}:`, err.message);
    }
  }

  return auditResults;
}
