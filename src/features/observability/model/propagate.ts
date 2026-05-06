import { createClient } from '@supabase/supabase-js';
import { runManagementQuery, extractProjectRef } from '@/shared/supabase-management';
import { getOeirasMigrations, getTenantAppliedVersions, Migration } from './migration-catalog';

/**
 * Gate de segurança para evitar comandos destrutivos acidentais durante a propagação massiva
 */
const BLOCKED = [
  /DROP\s+TABLE/i,
  /DROP\s+SCHEMA/i,
  /TRUNCATE/i,
  /ALTER\s+TYPE/i,
  /DELETE\s+FROM\s+\w+\s*($|;|\s+WHERE\s+true)/i,
];

function isSafe(sql: string): boolean {
  return !BLOCKED.some(r => r.test(sql));
}

export type TenantConfig = {
  id: string;              // tenant_code
  url: string;             // supabase_url
  serviceKey: string;      // supabase_secret_keys
  managementToken: string; // supabase_access_token (PAT)
}

export type PropagateOptions = {
  oeiras: TenantConfig;
  tenants: TenantConfig[];
  targetTenant?: string;
  dryRun?: boolean;
  fromVersion?: string;
}

export type PropagateResult = {
  tenant: string;
  applied: string[];   // versions aplicadas com sucesso
  skipped: string[];   // versions já aplicadas
  blocked: string[];   // versions bloqueadas pelo gate
  failed?: string;     // version que falhou
  error?: string;
}

/**
 * Propaga migrations de Oeiras para os demais tenants selecionados
 */
export async function propagateFromOeiras(
  options: PropagateOptions,
  adminClient: ReturnType<typeof createClient>
): Promise<PropagateResult[]> {
  const { oeiras, tenants, targetTenant, dryRun, fromVersion } = options;
  const results: PropagateResult[] = [];

  console.log(`📡 Obtendo catálogo de migrations de OEIRAS...`);
  let oeirasMigrations: Migration[] = [];
  try {
    oeirasMigrations = await getOeirasMigrations(oeiras.url, oeiras.managementToken);
  } catch (err) {
    console.error(`❌ Erro crítico ao ler OEIRAS:`, err);
    throw new Error(`Falha ao iniciar: impossível ler migrations de referência (Oeiras).`);
  }

  for (const tenant of tenants) {
    // Pula o próprio OEIRAS e filtra por tenant específico se solicitado
    if (tenant.id === oeiras.id) continue;
    if (targetTenant && tenant.id !== targetTenant) continue;

    console.log(`\n🔍 Processando tenant: ${tenant.id}...`);
    const tenantResult: PropagateResult = {
      tenant: tenant.id,
      applied: [],
      skipped: [],
      blocked: [],
    };

    try {
      const tenantProjectRef = extractProjectRef(tenant.url);
      const tenantAppliedVersions = await getTenantAppliedVersions(tenant.url, tenant.managementToken);

      const pending = oeirasMigrations.filter(m => {
        if (fromVersion && m.version < fromVersion) return false;
        if (tenantAppliedVersions.has(m.version)) {
          tenantResult.skipped.push(m.version);
          return false;
        }
        return true;
      });

      if (pending.length === 0) {
        console.log(`  ✔ Tenant já sincronizado.`);
        results.push(tenantResult);
        continue;
      }

      console.log(`  ➡ ${pending.length} migrations pendentes.`);

      for (const migration of pending) {
        console.log(`  - [${migration.version}] ${migration.name}`);

        // Validação de Segurança
        const isMigrationSafe = migration.statements.every(isSafe);
        if (!isMigrationSafe) {
          console.warn(`    ⚠️ BLOQUEADA: Contém comandos restritos.`);
          tenantResult.blocked.push(migration.version);
          continue;
        }

        if (dryRun) {
          console.log(`    (Dry-run) Pronto para aplicar ${migration.statements.length} statements.`);
          tenantResult.applied.push(migration.version);
          continue;
        }

        // Detecção de funções na migration para verificação posterior
        const functionCreationRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)\s*\((.*?)\)/gi;
        const functionsToVerify: { name: string; args: string }[] = [];
        
        for (const statement of migration.statements) {
          let match;
          while ((match = functionCreationRegex.exec(statement)) !== null) {
            functionsToVerify.push({ name: match[1], args: match[2].trim() });
          }
        }

        try {
          await runManagementQuery(tenantProjectRef, tenant.managementToken, transactionSQL);
          
          let integrityCheckPassed = true;
          if (functionsToVerify.length > 0) {
            console.log(`    🔍 Verificando integridade de ${functionsToVerify.length} funções...`);
            const oeirasProjectRef = extractProjectRef(oeiras.url);
            
            for (const fn of functionsToVerify) {
              const hashQuery = `
                SELECT md5(replace(pg_get_functiondef(p.oid), chr(13), '')) as hash
                FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' 
                  AND p.proname = '${fn.name}'
                  AND pg_get_function_identity_arguments(p.oid) = '${fn.args.replace(/'/g, "''")}';
              `;
              
              const [oeirasRes, tenantRes] = await Promise.all([
                runManagementQuery(oeirasProjectRef, oeiras.managementToken, hashQuery),
                runManagementQuery(tenantProjectRef, tenant.managementToken, hashQuery)
              ]);

              const oeirasHash = oeirasRes[0]?.hash;
              const tenantHash = tenantRes[0]?.hash;

              if (!oeirasHash || !tenantHash || oeirasHash !== tenantHash) {
                const errorDetail = `Hash mismatch na função ${fn.name}. Esperado (OEIRAS): ${oeirasHash || 'N/A'}, Obtido (${tenant.id}): ${tenantHash || 'N/A'}`;
                console.error(`    ❌ Falha de integridade:`, errorDetail);
                
                tenantResult.failed = migration.version;
                tenantResult.error = errorDetail;
                
                await syncAdminMirror(adminClient, tenant.id, migration, 'failed', errorDetail);
                integrityCheckPassed = false;
                break;
              }
              console.log(`    ✅ Função ${fn.name} validada (MD5 OK)`);
            }
          }

          if (!integrityCheckPassed) break; // Sai do loop de migrations do tenant
          // --- FIM DA VERIFICAÇÃO ---

          tenantResult.applied.push(migration.version);
          console.log(`    ✅ Sucesso`);

          // Espelhamento no Banco Admin (Async)
          syncAdminMirror(adminClient, tenant.id, migration, 'success').catch(e => 
            console.error(`    [Mirror Error] Falha ao registrar no Admin:`, e.message)
          );

        } catch (execErr: any) {
          const errorMsg = execErr.message || 'Erro desconhecido na execução SQL';
          console.error(`    ❌ Falha:`, errorMsg);
          
          tenantResult.failed = migration.version;
          tenantResult.error = errorMsg;

          // Registra falha no Admin (Async)
          syncAdminMirror(adminClient, tenant.id, migration, 'failed', errorMsg).catch(e =>
            console.error(`    [Mirror Error] Falha ao registrar erro no Admin:`, e.message)
          );

          // INTERROMPE a sequência para este tenant, mas segue para o próximo tenant
          break;
        }
      }
    } catch (tenantErr: any) {
      console.error(`  ❌ Erro geral no tenant ${tenant.id}:`, tenantErr.message);
      tenantResult.error = tenantErr.message;
    }

    results.push(tenantResult);
  }

  return results;
}

/**
 * Atualiza o espelho de controle no banco de dados do Admin
 * Esta tabela é a fonte de verdade para a UI de Observabilidade.
 */
async function syncAdminMirror(
  adminClient: ReturnType<typeof createClient>,
  tenantId: string,
  migration: Migration,
  status: 'success' | 'failed',
  errorDetail?: string
): Promise<void> {
  const { error } = await adminClient.from('schema_migrations').upsert({
    tenant_id: tenantId,
    migration_name: migration.name,
    version: migration.version,
    status,
    applied_at: new Date().toISOString(),
    error_detail: errorDetail ?? null,
    statements: JSON.stringify(migration.statements),
  }, { onConflict: 'tenant_id,version' });

  if (error) throw error;
}
