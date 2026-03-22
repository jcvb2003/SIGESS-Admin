import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "@/services/settings.service";
import { toast } from "sonner";

export const useSettings = () => {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => settingsService.getSettings(),
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: any) => settingsService.updateProfile(profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Perfil atualizado com sucesso!");
    }
  });
};
