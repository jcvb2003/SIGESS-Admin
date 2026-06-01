// Compatibilidade durante o big bang.
// As funções que lêem/escrevem entidades (Client antigo) continuam
// apontando para `entidades` enquanto a UI ainda não migrou.
// À medida que cada componente for atualizado para usar os novos services,
// remover o export correspondente. Quando vazio, deletar o arquivo.

import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";
import type { Client, ClientCreate, ClientUpdate } from "@/features/clients/types";

const ENTIDADES_SELECT =
  "id, nome_entidade, nome_abreviado, tenant_code, deployment_mode, shared_mode, shared_project_ref, shared_tenant_id, email, telefone, supabase_url, supabase_publishable_key, supabase_secret_keys, logo_url, assinatura, data_cadastro, supabase_access_token, acesso_expira_em, max_socios, key_status, last_health_check_at, health_error_detail";

/** @deprecated Migrar para listProjects() de projects.service.ts */
export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("entidades")
    .select(ENTIDADES_SELECT)
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data || []).map((item) => ({ ...item, assinatura: item.assinatura as Client["assinatura"] })) as Client[];
}

/** @deprecated Migrar para getProject() de projects.service.ts */
export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase
    .from("entidades")
    .select(ENTIDADES_SELECT)
    .eq("id", id)
    .single();

  if (error) throw handleSupabaseError(error);
  if (!data) throw new Error("Cliente não encontrado");
  return { ...data, assinatura: data.assinatura as Client["assinatura"] } as Client;
}

/** @deprecated Apenas para uso temporário — não usar em fluxos novos */
export async function createClient(input: ClientCreate): Promise<Client> {
  const { data, error } = await supabase
    .from("entidades")
    .insert(input)
    .select(ENTIDADES_SELECT)
    .single();

  if (error) throw handleSupabaseError(error);
  return { ...data, assinatura: data.assinatura as Client["assinatura"] } as Client;
}

/** @deprecated Migrar para updateProject() de projects.service.ts */
export async function updateClient(id: string, input: ClientUpdate): Promise<Client> {
  const { data, error } = await supabase
    .from("entidades")
    .update(input)
    .eq("id", id)
    .select(ENTIDADES_SELECT)
    .single();

  if (error) throw handleSupabaseError(error);
  return { ...data, assinatura: data.assinatura as Client["assinatura"] } as Client;
}

/** @deprecated Migrar para deleteCliente() de commercial-tenants.service.ts */
export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("entidades").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);
}

// ── Runtime operations — re-exports diretos, contrato não mudou ──────────────

export {
  listSharedTenants,
  listSharedTenantUnits,
  createSharedTenantUnit,
  updateSharedTenantUnit,
  deleteSharedTenantUnit,
  listSharedTenantUsers,
  createSharedTenantAdmin,
  createSharedTenantOperator,
  createSharedTenantOperatorWithMembership,
  deleteSharedTenantUser,
  updateSharedTenantUser,
  listSharedMemberships,
  createSharedMembership,
  updateSharedMembership,
  deleteSharedMembership,
  verifyPassword,
} from "@/services/runtime-tenants.service";

export {
  startProjectOnboarding as startTenantOnboarding,
  getOnboardingJobStatus,
  proxyAction,
} from "@/services/projects.service";
