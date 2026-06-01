import { useQuery } from "@tanstack/react-query";
import { listProjects } from "@/services/projects.service";

export const projectsQueryKey = ["projects"] as const;

export function useProjects() {
  return useQuery({
    queryKey: projectsQueryKey,
    queryFn: listProjects,
  });
}
