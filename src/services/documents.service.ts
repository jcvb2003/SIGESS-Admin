import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "./error.handler";
import type { Database } from "./supabase.types";

// Tipos temporários caso a feature documents tenha sido removida
export type DocumentTemplate = any;
export type DocumentField = any;

export const documentsService = {
  async listTemplates(): Promise<DocumentTemplate[]> {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw handleSupabaseError(error);
    
    const rows = data as Database["public"]["Tables"]["templates"]["Row"][];
    
    return rows.map((doc) => ({
      ...doc,
      document_type: "other",
      file_size: 0,
      content_type: "application/pdf",
      font_data: (doc.font_data as unknown as DocumentField[]) || [],
    }));
  },

  async uploadTemplate(file: File): Promise<DocumentTemplate> {
    const timestamp = Date.now();
    const safeFileName = file.name.replaceAll(/\s+/g, "_");
    const filePath = `templates/${timestamp}-${safeFileName}`;

    // 1. Upload to storage
    const { error: storageError } = await supabase.storage
      .from("documentos")
      .upload(filePath, file);

    if (storageError) throw handleSupabaseError(storageError);

    // 2. Get public URL
    const { data: publicURLData } = supabase.storage
      .from("documentos")
      .getPublicUrl(filePath);

    // 3. Save metadata (default configuration)
    const fontData: DocumentField[] = [
      {
        fieldName: "campo1",
        fontConfig: {
          fontName: "Arial",
          fontSize: 12,
          fontColor: "#000000",
          alignment: "left",
        },
      },
    ];

    const { data, error: dbError } = await supabase
      .from("templates")
      .insert({
        name: file.name,
        file_path: filePath,
        file_url: publicURLData.publicUrl,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        font_data: fontData as any,
      })
      .select()
      .single();

    if (dbError) throw handleSupabaseError(dbError);

    const typedData = data as Database["public"]["Tables"]["templates"]["Row"];

    return {
      ...typedData,
      document_type: "other",
      file_size: file.size,
      content_type: file.type,
      font_data: (typedData.font_data as unknown as DocumentField[]) || [],
    };
  },

  async deleteTemplate(doc: DocumentTemplate): Promise<void> {
    // 1. Delete from storage
    const { error: storageError } = await supabase.storage
      .from("documentos")
      .remove([doc.file_path]);

    if (storageError) {
      console.error("Storage deletion error (continuing with DB deletion):", storageError);
    }

    // 2. Delete from database
    const { error: dbError } = await supabase
      .from("templates")
      .delete()
      .eq("id", doc.id);

    if (dbError) throw handleSupabaseError(dbError);
  }
};
