import { supabase } from '@/lib/supabase';

export async function runSchemaAudit(referenceProjectId: string, targetProjectId?: string): Promise<{
  success: boolean;
  results?: Array<{
    tenantId: string;
    projectName: string;
    totalDiffs: number;
    diffs: unknown[];
    summary: { total: number; byCategory: Record<string, number> };
  }>;
  error?: string;
}> {
  const { data, error } = await supabase.functions.invoke('schema-audit', {
    body: {
      referenceProjectId,
      ...(targetProjectId ? { targetProjectId } : {}),
    },
  });

  if (error) throw new Error(`Erro ao invocar auditoria: ${error.message}`);
  if (data?.error) throw new Error(`Falha na auditoria: ${data.error}`);

  return data;
}
