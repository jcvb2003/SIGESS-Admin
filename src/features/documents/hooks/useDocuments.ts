import { useQuery } from "@tanstack/react-query";
import { documentsService } from "@/services/documents.service";

export const documentsQueryKey = ["documents"] as const;

export function useDocuments() {
  return useQuery({
    queryKey: documentsQueryKey,
    queryFn: () => documentsService.listTemplates(),
  });
}
