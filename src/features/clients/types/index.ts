export interface Client {
  id: string;
  nome_entidade: string;
  tenant_code: string;
  deployment_mode: "isolated" | "shared";
  shared_project_ref: string | null;
  shared_tenant_id: string | null;
  email: string | null;
  telefone: string | null;
  supabase_url: string;
  supabase_publishable_key: string;
  supabase_secret_keys: string | null;
  supabase_access_token: string | null;
  logo_url: string | null;
  assinatura: "mensal" | "anual" | "trial";
  acesso_expira_em: string | null;
  max_socios: number | null;
  data_cadastro: string;
  key_status: "valid" | "broken" | "unknown";
  last_health_check_at: string | null;
  health_error_detail: string | null;
}

export type ClientCreate = Omit<Client, "id" | "data_cadastro">;
export type ClientUpdate = Partial<ClientCreate>;

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

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  tenant_role: "owner" | "manager" | "member";
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_profiles?: UserProfile | null;
}

export interface UserUnitMembership {
  id: string;
  user_id: string;
  tenant_id: string;
  unit_id: string | null;
  role: "tenant_admin" | "unit_manager" | "unit_operator" | "unit_viewer";
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
