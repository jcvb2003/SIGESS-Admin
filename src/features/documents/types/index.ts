export type DocumentType = "template" | "contract" | "report" | "other";

export interface FontConfig {
  fontName: string;
  fontSize: number;
  fontColor: string;
  alignment: "left" | "center" | "right";
}

export interface DocumentField {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Permite que a interface seja compatível com o tipo Json do Supabase
  fieldName: string;
  fontConfig: FontConfig;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  file_path: string;
  file_url: string;
  document_type?: DocumentType;
  file_size?: number;
  content_type?: string;
  font_data: DocumentField[];
  created_at: string | null;
  description?: string | null;
  updated_at?: string | null;
}

export interface DocumentCreate {
  name: string;
  file_path: string;
  file_url: string;
  font_data?: DocumentField[];
}

export const DOCUMENT_TYPES: Record<string, string> = {
  inss_application: "Requerimento INSS",
  contract: "Contrato de Honorários",
  declaration: "Declaração de Hipossuficiência",
  other: "Outro",
};
