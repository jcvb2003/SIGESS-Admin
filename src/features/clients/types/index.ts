export interface Client {
  id: string;
  nome_entidade: string;
  email: string | null;
  telefone: string | null;
  supabase_url: string;
  supabase_publishable_key: string | null;
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
