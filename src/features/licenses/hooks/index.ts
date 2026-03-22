import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { licensesService } from "@/services/licenses.service";
import type { License, LicenseCreate } from "../types";
import { toast } from "sonner";

export const useLicenses = () => {
  return useQuery({
    queryKey: ["licenses"],
    queryFn: () => licensesService.list(),
  });
};

export const useCreateLicense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (license: LicenseCreate) => licensesService.create(license),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licenses"] });
      toast.success("Licença gerada com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao gerar licença: " + error.message);
    }
  });
};

export const useUpdateLicense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, updates }: { key: string; updates: Partial<License> }) => 
      licensesService.update(key, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licenses"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar licença: " + error.message);
    }
  });
};

export const useDeleteLicense = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => licensesService.delete(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licenses"] });
      toast.success("Licença excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir licença: " + error.message);
    }
  });
};
