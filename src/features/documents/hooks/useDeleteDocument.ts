import { useMutation, useQueryClient } from "@tanstack/react-query";
import { documentsService } from "@/services/documents.service";
import { toast } from "sonner";
import { documentsQueryKey } from "./useDocuments";
import type { DocumentTemplate } from "../types";

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (doc: DocumentTemplate) => documentsService.deleteTemplate(doc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentsQueryKey });
      toast.success("Documento excluído com sucesso");
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir documento: ${error.message}`);
    }
  });
}
