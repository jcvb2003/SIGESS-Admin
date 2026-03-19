import type { Tables } from "@/integrations/supabase/types";

// Database types
export type Entidade = Tables<"entidades">;
export type Client = Tables<"entidades">;
export type DocumentTemplateDB = Tables<"document_templates">;

// Extended document type for UI (with additional fields for local state)
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
