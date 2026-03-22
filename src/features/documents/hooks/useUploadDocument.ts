import { useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsService } from "@/services/documents.service";
import { toast } from "sonner";
import { documentsQueryKey } from "./useDocuments";

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => documentsService.uploadTemplate(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentsQueryKey });
      toast.success("Documento enviado com sucesso");
    },
    onError: (error: any) => {
      toast.error(`Erro ao enviar documento: ${error.message}`);
    }
  });
}
