import { execSync } from "node:child_process";
import * as dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const ADMIN_URL = process.env.VITE_SUPABASE_URL;
const ADMIN_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const REPO_ROOT = path.resolve(process.cwd(), "..");

const FUNCTION_OWNERS: Record<string, string> = {
  "manage-user": path.join(REPO_ROOT, "Web"),
};

type ProjectRow = {
  id: string;
  project_name: string;
  supabase_url: string;
  supabase_access_token: string | null;
  topology: string;
};

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} nao definido no .env`);
  }
  return value;
}

function extractProjectRef(projectUrl: string) {
  const host = new URL(projectUrl).hostname;
  const projectRef = host.split(".")[0];
  if (!projectRef) {
    throw new Error(`Nao foi possivel extrair project ref de ${projectUrl}`);
  }
  return projectRef;
}

function getArgValue(flag: string) {
  const raw = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  return raw ? raw.slice(flag.length + 1) : undefined;
}

async function main() {
  const functionName = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!functionName) {
    console.error("Uso:");
    console.error("  npx tsx scripts/deploy-edge-function.ts <funcao>");
    console.error("  npx tsx scripts/deploy-edge-function.ts <funcao> --project=<id>");
    console.error("  npx tsx scripts/deploy-edge-function.ts <funcao> --ref=<project-ref>");
    process.exit(1);
  }

  const targetProjectId = getArgValue("--project");
  const targetProjectRef = getArgValue("--ref");
  const functionOwnerCwd = FUNCTION_OWNERS[functionName] ?? process.cwd();

  const adminUrl = requireEnv("VITE_SUPABASE_URL", ADMIN_URL);
  const adminKey = requireEnv("VITE_SUPABASE_SERVICE_ROLE_KEY", ADMIN_KEY);

  const adminClient = createClient(adminUrl, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await adminClient
    .from("projetos")
    .select("id, project_name, supabase_url, supabase_access_token, topology")
    .order("project_name", { ascending: true });

  if (error) {
    throw error;
  }

  let projects = ((data ?? []) as ProjectRow[]).filter(
    (project) => project.supabase_url && project.supabase_access_token,
  );

  if (targetProjectId) {
    projects = projects.filter((project) => project.id === targetProjectId);
  }

  if (targetProjectRef) {
    projects = projects.filter(
      (project) => extractProjectRef(project.supabase_url) === targetProjectRef,
    );
  }

  if (projects.length === 0) {
    throw new Error("Nenhum projeto elegivel encontrado para deploy.");
  }

  console.log(
    `\nIniciando deploy da funcao '${functionName}' para ${projects.length} projeto(s)\n`,
  );

  const failures: string[] = [];

  for (const project of projects) {
    const projectRef = extractProjectRef(project.supabase_url);
    const accessToken = project.supabase_access_token;

    console.log(`\n[${project.project_name}] (ref: ${projectRef}, topology: ${project.topology})`);

    try {
      const command = `npx supabase functions deploy ${functionName} --project-ref ${projectRef} --no-verify-jwt`;
      console.log(`Executando: ${command}`);

      execSync(command, {
        stdio: "inherit",
        cwd: functionOwnerCwd,
        env: {
          ...process.env,
          SUPABASE_ACCESS_TOKEN: accessToken ?? "",
        },
      });

      console.log(`Deploy concluido com sucesso em ${project.project_name}`);
    } catch (deployError) {
      failures.push(`${project.project_name} (${projectRef})`);
      console.error(`Erro no deploy para ${project.project_name}.`);
      console.error(
        `Detalhe: ${deployError instanceof Error ? deployError.message : String(deployError)}`,
      );
    }
  }

  console.log("\nProcesso finalizado.\n");

  if (failures.length > 0) {
    console.error("Projetos com falha:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Erro fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
