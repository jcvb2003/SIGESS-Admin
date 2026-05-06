/**
 * Informações básicas de uma Edge Function retornadas pela API de listagem
 */
export type EdgeFunctionInfo = {
  slug: string;
  name: string;
  version: number;
  verify_jwt: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Detalhes completos de uma Edge Function
 */
export type EdgeFunctionDetail = EdgeFunctionInfo & {
  id: string;
  status: string;
  import_map: boolean;
  entrypoint_path: string;
}

/**
 * Extrai o Project Ref de uma URL do Supabase
 * @param supabaseUrl "https://tnrzxuznerneilxoojgv.supabase.co"
 * @returns "tnrzxuznerneilxoojgv"
 */
export function extractProjectRef(supabaseUrl: string): string {
  try {
    const url = new URL(supabaseUrl);
    const hostParts = url.hostname.split('.');
    return hostParts[0];
  } catch (e) {
    // Fallback: se não for uma URL válida, assume que já é o ref
    return supabaseUrl.replace('https://', '').replace('.supabase.co', '').split('/')[0];
  }
}

/**
 * Executa SQL via Management API (database/query)
 * @see https://supabase.com/docs/reference/api/execute-sql
 */
export async function runManagementQuery(
  projectRef: string,
  token: string,
  sql: string
): Promise<Record<string, unknown>[]> {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Management API Error (${projectRef}) [${response.status}]: ${errorBody}`);
  }

  // A API retorna um array direto de objetos se for um comando SELECT
  // Se for DDL/DML sem RETURNING, retorna um array vazio []
  return await response.json();
}

/**
 * Lista todas as Edge Functions de um projeto
 * @see https://supabase.com/docs/reference/api/list-all-functions
 */
export async function listEdgeFunctions(
  projectRef: string,
  token: string
): Promise<EdgeFunctionInfo[]> {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/functions`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Management API Error (list functions) [${response.status}]: ${errorBody}`);
  }

  return await response.json();
}

/**
 * Busca detalhes de uma Edge Function específica
 * @see https://supabase.com/docs/reference/api/get-a-function
 */
export async function getEdgeFunction(
  projectRef: string,
  token: string,
  slug: string
): Promise<EdgeFunctionDetail | null> {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/functions/${slug}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Management API Error (get function ${slug}) [${response.status}]: ${errorBody}`);
  }

  return await response.json();
}
