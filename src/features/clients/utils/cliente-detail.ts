import type { Project } from "../types";

export function hasClientePolos(topology: Project["topology"]): boolean {
  return (
    topology === "isolated_polo" ||
    topology === "shared_multi_polo" ||
    topology === "shared_hybrid"
  );
}

export function hasClienteUsers(topology: Project["topology"]): boolean {
  return topology !== "shared_multi_polo" && topology !== "shared_hybrid";
}
