import { useQuery } from "@tanstack/react-query";
import { getProject } from "@/services/projects.service";

export const projectDetailQueryKey = (id: string) => ["projects", id] as const;

export function useProjectDetail(id: string) {
  return useQuery({
    queryKey: projectDetailQueryKey(id),
    queryFn: () => getProject(id),
    enabled: Boolean(id),
  });
}
