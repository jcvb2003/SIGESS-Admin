// ─────────────────────────────────────────────────────────────────────────────
// Topology — arquitetura do projeto
// unconfigured: projeto provisionado mas aguardando escolha de arquitetura
// ─────────────────────────────────────────────────────────────────────────────
export type Topology =
  | "unconfigured"
  | "isolated_single"
  | "isolated_polo"
  | "shared_multi_single"
  | "shared_multi_polo"
  | "shared_hybrid";

export const TOPOLOGY_LABEL: Record<Topology, string> = {
  unconfigured:        "Não configurado",
  isolated_single:     "Isolado — sem polos",
  isolated_polo:       "Isolado — com polos",
  shared_multi_single: "Compartilhado — N tenants, sem polos",
  shared_multi_polo:   "Compartilhado — N tenants com polos",
  shared_hybrid:       "Compartilhado — híbrido",
};

// ─────────────────────────────────────────────────────────────────────────────
// Project — representa o projeto Supabase (infraestrutura)
// ─────────────────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  project_name: string;
  topology: Topology;
  tenant_code: string;                // compatibilidade temporária — Web/tenant-config ainda depende
  supabase_url: string;
  supabase_publishable_key: string;
  supabase_secret_keys: string | null;
  supabase_access_token: string | null;
  supabase_account_id: string | null;
  key_status: "valid" | "broken" | "unknown";
  last_health_check_at: string | null;
  health_error_detail: string | null;
  data_cadastro: string;
}

export type ProjectUpdate = Partial<Omit<Project, "id" | "data_cadastro">>;

// ─────────────────────────────────────────────────────────────────────────────
// Cliente — representa o tenant/cliente comercial dentro de um projeto
// ─────────────────────────────────────────────────────────────────────────────
export interface Cliente {
  id: string;
  project_id: string;
  nome_entidade: string;
  nome_abreviado: string | null;
  tenant_code: string;                // fonte canônica para o Admin
  runtime_tenant_id: string | null;   // UUID do tenant no banco runtime do projeto
  supports_units: boolean;            // se este tenant tem polos (relevante em shared_hybrid)
  email: string | null;
  telefone: string | null;
  cnpj_cpf: string | null;
  logo_url: string | null;
  assinatura: "trial" | "monthly" | "annual";
  acesso_expira_em: string | null;
  max_socios: number;
  status: "active" | "inactive" | "suspended";
  data_cadastro: string;
  created_at: string;
  updated_at: string;
}

export type ClienteCreate = Omit<Cliente, "id" | "data_cadastro" | "created_at" | "updated_at">;
export type ClienteUpdate = Partial<Omit<ClienteCreate, "project_id">>;

// ─────────────────────────────────────────────────────────────────────────────
// ClienteComProjeto — shape usado nas listagens (clientes JOIN projetos)
// ─────────────────────────────────────────────────────────────────────────────
export interface ClienteComProjeto extends Cliente {
  projetos: Pick<Project,
    | "id"
    | "project_name"
    | "topology"
    | "supabase_url"
    | "supabase_publishable_key"
    | "key_status"
    | "last_health_check_at"
    | "health_error_detail"
    | "data_cadastro"
  >;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legado — manter somente os tipos, não as queries. Remover depois da migração
// completa da UI.
// ─────────────────────────────────────────────────────────────────────────────
/** @deprecated Usar Project + Cliente */
export type SharedMode = "polo" | "multi" | "multi_polo" | "hybrid";

/** @deprecated Usar Project + Cliente */
export interface Client {
  id: string;
  nome_entidade: string;
  tenant_code: string;
  deployment_mode: "isolated" | "shared";
  shared_mode: SharedMode | null;
  shared_project_ref: string | null;
  shared_tenant_id: string | null;
  email: string | null;
  telefone: string | null;
  supabase_url: string;
  supabase_publishable_key: string;
  supabase_secret_keys: string | null;
  supabase_access_token: string | null;
  nome_abreviado: string | null;
  logo_url: string | null;
  assinatura: "mensal" | "anual" | "trial";
  acesso_expira_em: string | null;
  max_socios: number | null;
  data_cadastro: string;
  key_status: "valid" | "broken" | "unknown";
  last_health_check_at: string | null;
  health_error_detail: string | null;
}

/** @deprecated Usar ProjectUpdate / ClienteCreate */
export type ClientCreate = Omit<Client, "id" | "data_cadastro">;
/** @deprecated Usar ProjectUpdate / ClienteUpdate */
export type ClientUpdate = Partial<ClientCreate>;

// ─────────────────────────────────────────────────────────────────────────────
// Runtime — tenants e usuários no banco do projeto (compartilhado ou isolado)
// ─────────────────────────────────────────────────────────────────────────────
export interface SharedTenant {
  id: string;
  code: string;
  name: string;
}

export interface TenantUnit {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  city: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  nome: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OperatorType = "presidente" | "auxiliar";

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  tenant_role: "owner" | "member";
  operator_type?: OperatorType | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_profiles?: UserProfile | null;
}

export interface UserUnitMembership {
  id: string;
  user_id: string;
  tenant_id: string;
  unit_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
