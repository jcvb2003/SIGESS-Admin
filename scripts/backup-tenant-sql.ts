import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { execSync, spawn } from 'child_process';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!ADMIN_URL || !ADMIN_KEY) {
  console.error('❌ VITE_SUPABASE_URL ou VITE_SUPABASE_SERVICE_ROLE_KEY não definidos no .env');
  process.exit(1);
}

function extractProjectRef(supabaseUrl: string): string {
  return new URL(supabaseUrl).hostname.split('.')[0];
}

function sha256hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function printUsage(): void {
  console.log(`
🗄️  SIGESS Backup SQL (pg_dump)

Uso:
  npm run backup:tenant -- --tenant=<tenant_code>
  npm run backup:project -- --project-ref=<project_ref>
  npm run backup:all

Opções:
  --tenant=<code>        Backup do projeto que contém esse tenant
  --project-ref=<ref>    Backup direto por project_ref
  --all                  Backup de todos os projetos (1 pg_dump por projeto)
  --triggered-by=<val>   cli:manual (default) | cli:batch | admin:ui

Paths gerados:
  isolated_single  →  backups/{ref}/{tenant_code}/{date}/schema.sql + data.sql
  shared_*         →  backups/{ref}/_full/{date}/schema.sql + data.sql
  `);
}

function runPgDump(connectionString: string, extraArgs: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn('pg_dump', [...extraArgs, '--no-password', '-d', connectionString], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`pg_dump saiu com código ${code}`));
      else resolve(Buffer.concat(chunks));
    });
    proc.on('error', (err) => reject(new Error(`Falha ao iniciar pg_dump: ${err.message}`)));
  });
}

async function uploadBuffer(
  adminClient: ReturnType<typeof createClient>,
  storagePath: string,
  buf: Buffer,
): Promise<void> {
  // LIMITE: Supabase Storage aceita até ~50MB por upload.
  // Para projetos grandes, data.sql pode exceder — o upload falhará com mensagem explícita.
  const { error } = await adminClient.storage
    .from('backups')
    .upload(storagePath, buf, { contentType: 'application/sql', upsert: true });
  if (error) throw new Error(`Upload falhou (${storagePath}): ${error.message}`);
}

interface ProjectRow {
  id: string;
  project_name: string;
  topology: string;
  supabase_url: string;
  runtime_db_url: string | null;
  tenant_codes: string[];
}

async function backupProject(
  adminClient: ReturnType<typeof createClient>,
  proj: ProjectRow,
  runId: string,
  mode: 'single' | 'batch',
  triggeredBy: string,
): Promise<void> {
  const { id, project_name, topology, supabase_url, runtime_db_url, tenant_codes } = proj;

  if (!runtime_db_url) {
    console.warn(`⚠️  [${project_name}] runtime_db_url não configurada — pulando.`);
    console.warn(`    Configure em Admin > Editar Projeto > Credenciais Sensíveis.`);
    return;
  }

  const projectRef = extractProjectRef(supabase_url);
  const isShared = topology.startsWith('shared');
  const backupLabel = isShared ? '_full' : (tenant_codes[0] ?? projectRef);
  const today = new Date().toISOString().split('T')[0];
  const basePath = `${projectRef}/${backupLabel}/${today}`;

  if (isShared && tenant_codes.length > 0) {
    console.log(`   ℹ️  Projeto compartilhado — dump cobre: [${tenant_codes.join(', ')}]`);
  }

  const { data: runRow, error: insertErr } = await adminClient
    .from('backup_runs')
    .insert({
      run_id: runId,
      project_id: id,
      project_ref: projectRef,
      backup_label: backupLabel,
      backup_date: today,
      mode,
      status: 'running',
      triggered_by: triggeredBy,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.warn(`   ⚠️  backup_runs insert falhou: ${insertErr.message}`);
  }

  const runRowId: string | undefined = (runRow as any)?.id;

  const updateRun = async (fields: Record<string, unknown>) => {
    if (!runRowId) return;
    await adminClient.from('backup_runs').update(fields).eq('id', runRowId);
  };

  try {
    console.log(`   ➡ schema.sql...`);
    const schemaBuf = await runPgDump(runtime_db_url, ['--schema-only']);
    const schemaPath = `${basePath}/schema.sql`;
    await uploadBuffer(adminClient, schemaPath, schemaBuf);
    console.log(`   ✅ schema.sql — ${(schemaBuf.length / 1024).toFixed(1)} KB`);

    console.log(`   ➡ data.sql...`);
    const dataBuf = await runPgDump(runtime_db_url, ['--data-only']);
    const dataPath = `${basePath}/data.sql`;
    await uploadBuffer(adminClient, dataPath, dataBuf);
    console.log(`   ✅ data.sql — ${(dataBuf.length / 1024).toFixed(1)} KB`);

    await updateRun({
      status: 'success',
      schema_path: schemaPath,
      data_path: dataPath,
      schema_size_bytes: schemaBuf.length,
      data_size_bytes: dataBuf.length,
      schema_checksum: sha256hex(schemaBuf),
      data_checksum: sha256hex(dataBuf),
      finished_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`   ❌ ${msg}`);
    await updateRun({ status: 'failed', error_detail: msg, finished_at: new Date().toISOString() });
  }
}

// ─── Parse args ───────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const isAll = rawArgs.includes('--all');
const tenantArg = rawArgs.find((a) => a.startsWith('--tenant='))?.split('=')[1];
const projectRefArg = rawArgs.find((a) => a.startsWith('--project-ref='))?.split('=')[1];
const triggeredBy = rawArgs.find((a) => a.startsWith('--triggered-by='))?.split('=')[1] ?? 'cli:manual';

const exclusiveCount = [isAll, !!tenantArg, !!projectRefArg].filter(Boolean).length;
if (exclusiveCount === 0) { printUsage(); process.exit(1); }
if (exclusiveCount > 1) {
  console.error('❌ --all, --tenant e --project-ref são mutuamente exclusivos');
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    execSync('pg_dump --version', { stdio: 'ignore' });
  } catch {
    console.error('❌ pg_dump não encontrado no PATH. Instale postgresql-client.');
    process.exit(1);
  }

  const adminClient = createClient(ADMIN_URL!, ADMIN_KEY!);
  const runId = crypto.randomUUID();

  console.log(`\n🗄️  SIGESS Backup SQL | Run ID: ${runId}`);

  const { data: allProjects, error: projErr } = await adminClient
    .from('projetos')
    .select('id, project_name, topology, supabase_url, runtime_db_url')
    .neq('topology', 'unconfigured');

  if (projErr) { console.error('❌ Falha ao buscar projetos:', projErr.message); process.exit(1); }

  const { data: allTenants, error: tenantErr } = await adminClient
    .from('tenants')
    .select('project_id, tenant_code');

  if (tenantErr) { console.error('❌ Falha ao buscar tenants:', tenantErr.message); process.exit(1); }

  const tenantsByProject: Record<string, string[]> = {};
  for (const t of (allTenants ?? [])) {
    if (!tenantsByProject[t.project_id]) tenantsByProject[t.project_id] = [];
    tenantsByProject[t.project_id].push(t.tenant_code);
  }

  const projectRows: ProjectRow[] = (allProjects ?? []).map((p: any) => ({
    id: p.id,
    project_name: p.project_name,
    topology: p.topology,
    supabase_url: p.supabase_url,
    runtime_db_url: p.runtime_db_url ?? null,
    tenant_codes: tenantsByProject[p.id] ?? [],
  }));

  let toProcess: ProjectRow[];
  if (isAll) {
    toProcess = projectRows;
  } else if (projectRefArg) {
    toProcess = projectRows.filter((p) => extractProjectRef(p.supabase_url) === projectRefArg);
    if (toProcess.length === 0) {
      console.error(`❌ Nenhum projeto para project-ref: ${projectRefArg}`);
      process.exit(1);
    }
  } else {
    const matched = projectRows.find((p) => p.tenant_codes.includes(tenantArg!));
    if (!matched) {
      console.error(`❌ tenant '${tenantArg}' não encontrado em nenhum projeto`);
      process.exit(1);
    }
    toProcess = [matched];
  }

  const mode: 'single' | 'batch' = isAll ? 'batch' : 'single';
  console.log(`🚀 Processando ${toProcess.length} projeto(s)...\n`);

  const skipped: string[] = [];
  for (const proj of toProcess) {
    console.log(`\n⏳ [${proj.project_name}] (${proj.topology})`);
    if (!proj.runtime_db_url) skipped.push(proj.project_name);
    await backupProject(adminClient, proj, runId, mode, triggeredBy);
  }

  console.log(`\n✅ Backup finalizado | Run ID: ${runId}`);
  if (skipped.length > 0) {
    console.log(`⚠️  Sem runtime_db_url: ${skipped.join(', ')}`);
  }
})();
