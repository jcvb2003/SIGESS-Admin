import { useState, useEffect } from "react";
import { FileText, Settings2, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentTemplate, DocumentType } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function GlobalPage() {
  const [documents, setDocuments] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Map database schema to our extended DocumentTemplate type
      const mappedDocuments: DocumentTemplate[] = (data || []).map((doc) => ({
        ...doc,
        document_type: "other" as DocumentType, // Default since DB doesn't have this column
        file_size: 0,
        content_type: "application/pdf",
      }));

      setDocuments(mappedDocuments);
    } catch (error: any) {
      toast.error("Erro ao carregar documentos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File, documentType: DocumentType) => {
    try {
      const timestamp = Date.now();
      const safeFileName = file.name.replace(/\s+/g, "_");
      const filePath = `templates/${timestamp}-${safeFileName}`;

      // Upload file to storage
      const { error: storageError } = await supabase.storage
        .from("documentos")
        .upload(filePath, file);

      if (storageError) throw storageError;

      // Get public URL
      const { data: publicURLData } = supabase.storage
        .from("documentos")
        .getPublicUrl(filePath);

      // Mock font extraction (would be done by a real PDF parser)
      const fontData = [
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

      // Save metadata to database
      const { error: dbError } = await supabase.from("document_templates").insert({
        name: file.name,
        file_path: filePath,
        file_url: publicURLData.publicUrl,
        font_data: fontData,
      });

      if (dbError) throw dbError;

      toast.success("Documento enviado com sucesso!");
      fetchDocuments();
    } catch (error: any) {
      toast.error("Erro ao enviar documento: " + error.message);
      throw error;
    }
  };

  const handleDownload = (doc: DocumentTemplate) => {
    window.open(doc.file_url, "_blank");
    toast.success(`Baixando ${doc.name}...`);
  };

  const handleDelete = async (doc: DocumentTemplate) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("documentos")
        .remove([doc.file_path]);

      if (storageError) {
        console.error("Storage deletion error:", storageError);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from("document_templates")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success(`${doc.name} foi excluído`);
    } catch (error: any) {
      toast.error("Erro ao excluir documento: " + error.message);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Global</h1>
          <p className="mt-1 text-muted-foreground">
            Parâmetros e documentos compartilhados entre todos os clientes
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="documents" className="space-y-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="h-4 w-4" />
              Documentos
            </TabsTrigger>
            <TabsTrigger value="parameters" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Parâmetros
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-6">
            {/* Upload Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Upload de Modelo
              </h2>
              <DocumentUpload onUpload={handleUpload} />
            </div>

            {/* Documents List */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">
                Modelos Salvos ({documents.length})
              </h2>
              <DocumentList
                documents={documents}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            </div>
          </TabsContent>

          <TabsContent value="parameters">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Settings2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">
                Parâmetros Globais
              </p>
              <p className="mt-1 text-muted-foreground">
                Em breve você poderá configurar parâmetros compartilhados
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}