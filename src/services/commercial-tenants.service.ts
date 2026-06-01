import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";
import type { Cliente, ClienteCreate, ClienteUpdate, ClienteComProjeto } from "@/features/clients/types";

const CLIENTE_SELECT =
  "id, project_id, nome_entidade, nome_abreviado, tenant_code, runtime_tenant_id, supports_units, email, telefone, cnpj_cpf, logo_url, assinatura, acesso_expira_em, max_socios, status, data_cadastro, created_at, updated_at";

const CLIENTE_COM_PROJETO_SELECT =
  `${CLIENTE_SELECT}, projetos(id, project_name, topology, supabase_url, supabase_publishable_key, key_status, last_health_check_at, health_error_detail, data_cadastro)`;

export async function listClientes(): Promise<ClienteComProjeto[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select(CLIENTE_COM_PROJETO_SELECT)
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data || []) as unknown as ClienteComProjeto[];
}

export async function listClientesByProject(projectId: string): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select(CLIENTE_SELECT)
    .eq("project_id", projectId)
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  return (data || []) as Cliente[];
}

export async function getCliente(id: string): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .select(CLIENTE_SELECT)
    .eq("id", id)
    .single();

  if (error) throw handleSupabaseError(error);
  if (!data) throw new Error("Cliente não encontrado");
  return data as Cliente;
}

export async function createCliente(input: ClienteCreate): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .insert(input)
    .select(CLIENTE_SELECT)
    .single();

  if (error) throw handleSupabaseError(error);
  return data as Cliente;
}

export async function updateCliente(id: string, input: ClienteUpdate): Promise<Cliente> {
  const { data, error } = await supabase
    .from("clientes")
    .update(input)
    .eq("id", id)
    .select(CLIENTE_SELECT)
    .single();

  if (error) throw handleSupabaseError(error);
  return data as Cliente;
}

export async function deleteCliente(id: string): Promise<void> {
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);
}

export function isExpired(cliente: Pick<Cliente, "acesso_expira_em">): boolean {
  if (!cliente.acesso_expira_em) return false;
  return new Date(cliente.acesso_expira_em) < new Date();
}

export function daysUntilExpiry(cliente: Pick<Cliente, "acesso_expira_em">): number | null {
  if (!cliente.acesso_expira_em) return null;
  const diff = new Date(cliente.acesso_expira_em).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
