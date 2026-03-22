// Client / Entidade type
export interface Client {
  id: string;
  nome_entidade: string;
  email: string | null;
  telefone: string | null;
  supabase_url: string;
  supabase_publishable_key: string | null;
  supabase_secret_keys: string | null;
  logo_url: string | null;
  assinatura: string;
  data_cadastro: string;
}

export type Entidade = Client;

// Extended document type for UI
export interface DocumentTemplate {
  id: string;
  name: string;
  description?: string | null;
  document_type?: string;
  file_path: string;
  file_url: string;
  file_size?: number;
  content_type?: string;
  font_data?: any;
  created_at: string | null;
  updated_at: string | null;
}

export interface DashboardStats {
  totalClients: number;
  activeClients: number;
  totalStorage: number;
  totalTables: number;
}

export interface FieldFontConfig {
  fieldName: string;
  fontConfig: {
    fontName: string;
    fontSize: number;
    fontColor: string;
    alignment: 'left' | 'center' | 'right';
  };
}

export const DOCUMENT_TYPES = {
  inss_application: "INSS",
  residence_declaration: "Residência",
  representation_term: "Termo",
  other: "Outro",
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;
