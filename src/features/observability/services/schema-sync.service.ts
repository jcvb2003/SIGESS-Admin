import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { TenantSchemaStatus } from '../model/schema-comparator';

export async function runSchemaAudit(): Promise<{ success: boolean, results?: any[], error?: string }> {
  const { data, error } = await supabase.functions.invoke('schema-audit', {
    method: 'POST',
  });

  if (error) {
    throw new Error(`Erro ao invocar auditoria: ${error.message}`);
  }

  if (data?.error) {
    throw new Error(`Falha na auditoria: ${data.error}`);
  }

  return data;
}

export async function getSchemaSyncStatus(): Promise<TenantSchemaStatus[]> {
  const { data, error } = await supabase
    .from('schema_sync_status')
    .select(`
      tenant_id,
      checked_at,
      total_diffs,
      diffs,
      summary,
      entidades ( nome_entidade, tenant_code )
    `)
    .order('checked_at', { ascending: false });

  if (error) {
    throw new Error(`Erro ao carregar status de sync: ${error.message}`);
  }

  return (data || []).map(row => ({
    tenantId: row.tenant_id,
    tenantName: row.entidades?.nome_entidade || row.entidades?.tenant_code || 'Unknown',
    checkedAt: row.checked_at,
    totalDiffs: row.total_diffs,
    diffs: row.diffs,
    summary: row.summary
  }));
}
