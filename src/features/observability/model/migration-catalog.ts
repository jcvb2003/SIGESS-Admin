import { runManagementQuery, extractProjectRef } from '@/shared/supabase-management';

/**
 * Representa uma migration estruturada conforme o schema canônico do Supabase
 */
export type Migration = {
  version: string;
  name: string;
  statements: string[]; // Array de comandos SQL
}

/**
 * Busca todas as migrations registradas no ambiente de referência (Rayssa)
 * @param referenceUrl URL do projeto Rayssa
 * @param referenceToken PAT (Personal Access Token) com acesso ao projeto
 */
export async function getReferenceMigrations(
  referenceUrl: string,
  referenceToken: string
): Promise<Migration[]> {
  const projectRef = extractProjectRef(referenceUrl);
  const sql = `
    SELECT version, name, statements 
    FROM supabase_migrations.schema_migrations 
    ORDER BY version ASC
  `;

  const results = await runManagementQuery(projectRef, referenceToken, sql);
  
  return results.map((row: any) => ({
    version: row.version,
    name: row.name,
    statements: row.statements || []
  }));
}

/**
 * Obtém o conjunto de versões de migrations já aplicadas em um tenant
 * @param tenantUrl URL do projeto do tenant
 * @param tenantToken PAT com acesso ao projeto do tenant
 */
export async function getTenantAppliedVersions(
  tenantUrl: string,
  tenantToken: string
): Promise<Set<string>> {
  const projectRef = extractProjectRef(tenantUrl);
  const sql = `SELECT version FROM supabase_migrations.schema_migrations`;

  try {
    const results = await runManagementQuery(projectRef, tenantToken, sql);
    return new Set(results.map((row: any) => row.version));
  } catch (error) {
    // Se a tabela não existir, assume que nenhuma migration foi aplicada
    console.warn(`[MigrationCatalog] Aviso ao ler versions do tenant ${projectRef}:`, error);
    return new Set();
  }
}

/**
 * Identifica quais migrations de Rayssa ainda não foram aplicadas no tenant
 */
export async function getPendingMigrations(
  referenceUrl: string,
  referenceToken: string,
  tenantUrl: string,
  tenantToken: string,
  fromVersion?: string
): Promise<Migration[]> {
  const [referenceMigrations, tenantVersions] = await Promise.all([
    getReferenceMigrations(referenceUrl, referenceToken),
    getTenantAppliedVersions(tenantUrl, tenantToken)
  ]);

  return referenceMigrations.filter(m => {
    // Filtro por versão mínima, se fornecida
    if (fromVersion && m.version < fromVersion) return false;
    
    // Filtra apenas as que NÃO estão no Set do tenant
    return !tenantVersions.has(m.version);
  });
}
