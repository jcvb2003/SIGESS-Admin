import { FileText, Settings2, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DocumentUpload, 
  DocumentList, 
  useDocuments, 
  useUploadDocument, 
  useDeleteDocument,
  DocumentTemplate 
} from "@/features/documents";
import { toast } from "sonner";

export default function GlobalPage() {
  const { data: documents = [], isLoading } = useDocuments();
  const uploadMutation = useUploadDocument();
  const deleteMutation = useDeleteDocument();

  const handleUpload = async (file: File) => {
    await uploadMutation.mutateAsync(file);
  };

  const handleDownload = (doc: DocumentTemplate) => {
    window.open(doc.file_url, "_blank");
    toast.success(`Baixando ${doc.name}...`);
  };

  const handleDelete = async (doc: DocumentTemplate) => {
    if (confirm(`Tem certeza que deseja excluir o documento ${doc.name}?`)) {
      await deleteMutation.mutateAsync(doc);
    }
  };

  if (isLoading) {
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
              <DocumentUpload onUpload={handleUpload} isUploading={uploadMutation.isPending} />
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
