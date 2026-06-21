import type { Project } from "../types";

export function hasClientePolos(topology: Project["topology"], supportsUnits?: boolean): boolean {
  if (topology === "shared_hybrid") return supportsUnits ?? true;
  return topology === "isolated_polo" || topology === "shared_multi_polo";
}

export function hasClienteUsers(topology: Project["topology"], supportsUnits?: boolean): boolean {
  if (topology === "shared_hybrid") return !(supportsUnits ?? true);
  return topology !== "shared_multi_polo";
}
