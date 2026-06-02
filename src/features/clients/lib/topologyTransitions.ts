import type { Topology } from "../types";

export interface TopologyOption {
  topology: Topology;
  disabled: boolean;
  reason?: string;
}

const BLOCKED_SHARED_TO_ISOLATED =
  "Projeto shared não pode virar isolated por edição direta — exige migração de tenant";

/**
 * Retorna todas as topologias com disabled/reason com base no estado atual.
 * Usa apenas dados do Admin DB (tenantCount, tenantsWithUnits) — sem proxy.
 */
export function getTopologyOptions(
  current: Topology,
  tenantCount: number,
  tenantsWithUnits: number,
): TopologyOption[] {
  const tenantsWithoutUnits = tenantCount - tenantsWithUnits;
  const isShared = current.startsWith("shared");

  const rule = (topology: Topology): TopologyOption => {
    // Mesma topologia — sempre permitido (sem mudança)
    if (topology === current) return { topology, disabled: false };

    // Shared → isolated: sempre bloqueado
    if (isShared && topology.startsWith("isolated")) {
      return { topology, disabled: true, reason: BLOCKED_SHARED_TO_ISOLATED };
    }

    switch (topology) {
      case "isolated_single":
        // isolated_polo → isolated_single: só se nenhum tenant tem polos
        if (current === "isolated_polo") {
          return tenantsWithUnits > 0
            ? { topology, disabled: true, reason: "Tenant tem polos configurados" }
            : { topology, disabled: false };
        }
        return { topology, disabled: false };

      case "isolated_polo":
        // Já tratado acima para shared→isolated
        return { topology, disabled: false };

      case "shared_multi_single":
        // Redução de polo: bloqueado se há tenants com polos
        if (
          current === "shared_multi_polo" ||
          current === "shared_hybrid"
        ) {
          return tenantsWithUnits > 0
            ? { topology, disabled: true, reason: "Há tenants com polos configurados" }
            : { topology, disabled: false };
        }
        return { topology, disabled: false };

      case "shared_multi_polo":
        // hybrid → shared_multi_polo: só se todos os tenants têm polos
        if (current === "shared_hybrid") {
          return tenantsWithoutUnits > 0
            ? { topology, disabled: true, reason: "Há tenants sem polos configurados" }
            : { topology, disabled: false };
        }
        return { topology, disabled: false };

      case "shared_hybrid":
        return { topology, disabled: false };

      default:
        return { topology, disabled: false };
    }
  };

  const ALL: Topology[] = [
    "isolated_single",
    "isolated_polo",
    "shared_multi_single",
    "shared_multi_polo",
    "shared_hybrid",
  ];

  return ALL.map(rule);
}
