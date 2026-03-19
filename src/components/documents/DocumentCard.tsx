import { FileText, Download, Trash2, Settings } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocumentTemplate, DOCUMENT_TYPES, FieldFontConfig } from "@/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DocumentCardProps {
  document: DocumentTemplate;
  onDownload: (doc: DocumentTemplate) => void;
  onDelete: (doc: DocumentTemplate) => void;
}

export function DocumentCard({ document, onDownload, onDelete }: DocumentCardProps) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getConfigCount = () => {
    try {
      if (!document.font_data) return 0;
      const configs: FieldFontConfig[] = Array.isArray(document.font_data) ? document.font_data : [];
      return configs.length;
    } catch {
      return 0;
    }
  };

  const configCount = getConfigCount();
  const docType = document.document_type as keyof typeof DOCUMENT_TYPES | undefined;
  const typeLabel = docType && DOCUMENT_TYPES[docType] ? DOCUMENT_TYPES[docType] : "Outro";

  return (
    <Card className="p-5 hover:border-primary/30 transition-all duration-300 group">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
          <FileText className="h-6 w-6 text-destructive" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                {document.name}
              </h3>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {typeLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(document.file_size)}
                </span>
              </div>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onDownload(document)}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(document)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Settings className="h-4 w-4" />
              <span>{configCount} campos configurados</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {document.created_at && format(new Date(document.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
