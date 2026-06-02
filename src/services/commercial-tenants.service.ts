import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";
import type { Tenant, TenantCreate, TenantUpdate, TenantComProjeto } from "@/features/clients/types";

const TENANT_SELECT =
  "id, project_id, nome_entidade, nome_abreviado, tenant_code, runtime_tenant_id, supports_units, email, telefone, cnpj_cpf, logo_url, assinatura, acesso_expira_em, max_socios, status, data_cadastro, created_at, updated_at";

const TENANT_COM_PROJETO_SELECT =
  `${TENANT_SELECT}, projetos(id, project_name, topology, supabase_url, supabase_publishable_key, key_status, last_health_check_at, health_error_detail, data_cadastro)`;

export async function listTenants(): Promise<TenantComProjeto[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select(TENANT_COM_PROJETO_SELECT)
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data || []) as unknown as TenantComProjeto[];
}

export async function getTenantComProjetoByProjectId(projectId: string): Promise<TenantComProjeto | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select(TENANT_COM_PROJETO_SELECT)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw handleSupabaseError(error);
  return data as unknown as TenantComProjeto | null;
}

export async function listTenantCountsByProject(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("tenants")
    .select("project_id");

  if (error) throw handleSupabaseError(error);
  return (data || []).reduce<Record<string, number>>((acc, row) => {
    acc[row.project_id] = (acc[row.project_id] ?? 0) + 1;
    return acc;
  }, {});
}

export async function listTenantsByProject(projectId: string): Promise<Tenant[]> {
  const { data, error } = await supabase
    .from("tenants")
    .select(TENANT_SELECT)
    .eq("project_id", projectId)
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data || []) as Tenant[];
}

export async function getTenant(id: string): Promise<Tenant> {
  const { data, error } = await supabase
    .from("tenants")
    .select(TENANT_SELECT)
    .eq("id", id)
    .single();

  if (error) throw handleSupabaseError(error);
  if (!data) throw new Error("Tenant não encontrado");
  return data as Tenant;
}

export async function createTenant(input: TenantCreate): Promise<Tenant> {
  const { data, error } = await supabase
    .from("tenants")
    .insert(input)
    .select(TENANT_SELECT)
    .single();

  if (error) throw handleSupabaseError(error);
  return data as Tenant;
}

export async function updateTenant(id: string, input: TenantUpdate): Promise<Tenant> {
  const { data, error } = await supabase
    .from("tenants")
    .update(input)
    .eq("id", id)
    .select(TENANT_SELECT)
    .single();

  if (error) throw handleSupabaseError(error);
  return data as Tenant;
}

export async function deleteTenant(id: string): Promise<void> {
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);
}

// Aliases de compatibilidade — remover depois de atualizar todos os callers
/** @deprecated use listTenants */
export const listClientes = listTenants;
/** @deprecated use getTenantComProjetoByProjectId */
export const getClienteComProjetoByProjectId = getTenantComProjetoByProjectId;
/** @deprecated use listTenantCountsByProject */
export const listClientesCountsByProject = listTenantCountsByProject;
/** @deprecated use listTenantsByProject */
export const listClientesByProject = listTenantsByProject;
/** @deprecated use getTenant */
export const getCliente = getTenant;
/** @deprecated use createTenant */
export const createCliente = createTenant;
/** @deprecated use updateTenant */
export const updateCliente = updateTenant;
/** @deprecated use deleteTenant */
export const deleteCliente = deleteTenant;

export function isExpired(tenant: Pick<Tenant, "acesso_expira_em">): boolean {
  if (!tenant.acesso_expira_em) return false;
  return new Date(tenant.acesso_expira_em) < new Date();
}

export function daysUntilExpiry(tenant: Pick<Tenant, "acesso_expira_em">): number | null {
  if (!tenant.acesso_expira_em) return null;
  const diff = new Date(tenant.acesso_expira_em).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
