import { useState, useCallback } from "react";
import { Upload, FileText, Loader2, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DocumentType, DOCUMENT_TYPES } from "../types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DocumentUploadProps {
  readonly onUpload: (file: File, documentType: DocumentType) => Promise<void>;
  readonly isUploading?: boolean;
}

export function DocumentUpload({ onUpload, isUploading: isParentUploading }: DocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>("other");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extractingFonts, setExtractingFonts] = useState(false);

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  const validateFile = useCallback((file: File): boolean => {
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são permitidos");
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("O arquivo deve ter no máximo 2MB");
      return false;
    }
    return true;
  }, [MAX_FILE_SIZE]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && validateFile(droppedFile)) {
      setFile(droppedFile);
    }
  }, [validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setExtractingFonts(true);

    try {
      // Simulate font extraction
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setExtractingFonts(false);

      // Upload file
      await onUpload(file, documentType);
      
      setFile(null);
    } catch (error) {
       console.error("Document upload failed:", error);
       toast.error("Ocorreu um erro ao processar o upload");
    } finally {
      setUploading(false);
      setExtractingFonts(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isAnyUploading = uploading || isParentUploading;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de Documento</Label>
        <Select value={documentType} onValueChange={(v) => setDocumentType(v as DocumentType)}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DOCUMENT_TYPES).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card
        className={cn(
          "relative border-2 border-dashed p-8 transition-all duration-200",
          isDragging && "border-primary bg-primary/5",
          file && "border-primary/50 bg-primary/5"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          id="document-upload"
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={isAnyUploading}
          aria-label="Upload de documento PDF"
        />

        <div className="flex flex-col items-center justify-center text-center">
          {file ? (
            <>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/20">
                <FileText className="h-7 w-7 text-primary" />
              </div>
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </>
          ) : (
            <>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
                <Upload className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground">
                Arraste um arquivo PDF aqui
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                ou clique para selecionar (máx. 2MB)
              </p>
            </>
          )}
        </div>
      </Card>

      {file && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {extractingFonts && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Extraindo configurações de fonte...</span>
              </>
            )}
            {isAnyUploading && !extractingFonts && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Enviando arquivo...</span>
              </>
            )}
            {!isAnyUploading && (
              <>
                <CheckCircle className="h-4 w-4 text-primary" />
                <span>Pronto para enviar</span>
              </>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setFile(null)}
              disabled={isAnyUploading}
            >
              Cancelar
            </Button>
            <Button onClick={handleUpload} disabled={isAnyUploading}>
              {isAnyUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar Documento"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
