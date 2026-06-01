import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProject, proxyAction } from "@/services/projects.service";
import type { ProjectUpdate } from "@/features/clients/types";
import { projectsQueryKey } from "./useProjects";
import { projectDetailQueryKey } from "./useProjectDetail";

function useProjectsInvalidation() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    if (id) queryClient.invalidateQueries({ queryKey: projectDetailQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useUpdateProject() {
  const invalidate = useProjectsInvalidation();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectUpdate }) =>
      updateProject(id, input),
    onSuccess: (_, { id }) => invalidate(id),
  });
}

export function useUpdateProjectUserLicense(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: Record<string, unknown> }) =>
      proxyAction(projectId, "update-client-member", { userId, updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", projectId] });
    },
  });
}
