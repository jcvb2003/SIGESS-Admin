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
 * comparando-as com as versões presentes no tenant de referência (OEIRAS).
 */
export async function auditAllEdgeFunctions(
  adminClient: ReturnType<typeof createClient>
): Promise<EdgeFunctionAuditResult[]> {
  
  // 1. Carrega todos os tenants que possuem PAT (Personal Access Token)
  const { data: entidades, error: eErr } = await adminClient
    .from('entidades')
    .select('id, tenant_code, supabase_url, supabase_access_token')
    .not('supabase_access_token', 'is', null);

  if (eErr) throw eErr;

  // 2. Identifica OEIRAS como a fonte de verdade (referência)
  const oeiras = entidades.find(e => e.tenant_code === 'sinpesca-oeiras');
  if (!oeiras) {
    throw new Error('Impossível realizar auditoria: Tenant de referência (sinpesca-oeiras) não encontrado ou sem PAT.');
  }

  console.log(`🔍 Obtendo funções de referência em OEIRAS...`);
  const refRef = extractProjectRef(oeiras.supabase_url);
  const refFunctions = await listEdgeFunctions(refRef, oeiras.supabase_access_token);

  const auditResults: EdgeFunctionAuditResult[] = [];

  // 3. Itera sobre cada tenant para auditar disparidades
  for (const tenant of entidades) {
    // Pula o próprio OEIRAS na comparação
    if (tenant.tenant_code === 'sinpesca-oeiras') continue;

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
