import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";
import type { Project, ProjectUpdate } from "@/features/clients/types";

const PROJECT_SELECT =
  "id, project_name, topology, supabase_url, supabase_publishable_key, supabase_secret_keys, supabase_access_token, supabase_account_id, key_status, last_health_check_at, health_error_detail, data_cadastro";

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projetos")
    .select(PROJECT_SELECT)
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data || []) as Project[];
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projetos")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .single();

  if (error) throw handleSupabaseError(error);
  if (!data) throw new Error("Projeto não encontrado");
  return data as Project;
}

export async function deleteProject(id: string): Promise<void> {
  // Buscar supabase_account_id antes de deletar para decrementar o contador
  const { data: proj } = await supabase
    .from("projetos")
    .select("supabase_account_id")
    .eq("id", id)
    .maybeSingle();

  // Remover FK de onboarding_jobs para permitir a exclusão (preserva histórico dos jobs)
  await supabase.from("onboarding_jobs").update({ projeto_id: null }).eq("projeto_id", id);

  const { error } = await supabase.from("projetos").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);

  // Decrementar active_projects na conta Supabase associada
  if (proj?.supabase_account_id) {
    const { data: acc } = await supabase
      .from("supabase_accounts")
      .select("active_projects")
      .eq("id", proj.supabase_account_id)
      .maybeSingle();
    if (acc && typeof acc.active_projects === 'number' && acc.active_projects > 0) {
      await supabase
        .from("supabase_accounts")
        .update({ active_projects: acc.active_projects - 1 })
        .eq("id", proj.supabase_account_id);
    }
  }
}

export async function updateProject(id: string, input: ProjectUpdate): Promise<Project> {
  const { data, error } = await supabase
    .from("projetos")
    .update(input)
    .eq("id", id)
    .select(PROJECT_SELECT)
    .single();

  if (error) throw handleSupabaseError(error);
  return data as Project;
}

export async function proxyAction(
  projectId: string,
  action:
    | "list-users" | "list-tables" | "health-check" | "list-buckets"
    | "list-client-members" | "create-client-member" | "update-client-member"
    | "sync-trial-limits"
    | "repair-user-sync" | "delete-client-member" | "ban-client-member"
    | "process-data-import" | "apply-schema-drift" | "get-runtime-tenant-id"
    | "get-tenant-mode" | "update-tenant-mode"
    | "create-shared-tenant"
    | "list-shared-tenants" | "sync-shared-tenant-license"
    | "list-shared-tenant-units" | "create-shared-tenant-unit" | "update-shared-tenant-unit" | "delete-shared-tenant-unit"
    | "list-shared-tenant-users" | "create-shared-tenant-admin" | "create-shared-tenant-operator"
    | "delete-shared-tenant-user" | "update-shared-tenant-user"
    | "list-shared-memberships" | "create-shared-membership" | "update-shared-membership" | "delete-shared-membership",
  params?: Record<string, unknown>,
) {
  const check = await supabase.from("projetos").select("topology").eq("id", projectId).single();
  if (
    check.data?.topology?.startsWith("shared")
    && ![
      "get-runtime-tenant-id",
      "get-tenant-mode",
      "update-tenant-mode",
      "create-shared-tenant",
      "list-shared-tenants",
      "sync-shared-tenant-license",
      "list-shared-tenant-units",
      "create-shared-tenant-unit",
      "update-shared-tenant-unit",
      "delete-shared-tenant-unit",
      "list-shared-tenant-users",
      "create-shared-tenant-admin",
      "create-shared-tenant-operator",
      "delete-shared-tenant-user",
      "update-shared-tenant-user",
      "list-shared-memberships",
      "create-shared-membership",
      "update-shared-membership",
      "delete-shared-membership",
    ].includes(action)
  ) {
    throw new Error("Operações proxy não são permitidas em projetos shared. Use as operações runtime diretamente.");
  }

  const { data, error } = await supabase.functions.invoke("client-proxy", {
    body: { clientId: projectId, action, params },
  });

  if (error) {
    const ctx = (error as any).context as Response | undefined;
    if (ctx) {
      try {
        const body = await ctx.clone().json();
        if (body?.error) throw new Error(body.error);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== "body used already") throw parseErr;
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function startProjectOnboarding(payload: {
  tenantLabel: string;
  projectRef: string;
  supabaseAccountId: string;
  tenantCode?: string;
  adminEmail?: string;
  maxSocios?: number | null;
  acessoExpiraEm?: string | null;
  resumeFromJobId?: string;
}): Promise<{ jobId: string }> {
  const { data, error } = await supabase.functions.invoke("tenant-onboarding", {
    body: payload,
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { jobId: string };
}

export async function getOnboardingJobStatus(jobId: string) {
  const { data, error } = await supabase
    .from("onboarding_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data;
}
