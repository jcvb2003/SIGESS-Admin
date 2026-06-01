// Re-exports de compatibilidade durante a migração big bang.
// À medida que cada arquivo for atualizado para importar dos novos services,
// remover o export correspondente daqui.
// Quando este arquivo estiver vazio, deletá-lo.

export {
  listProjects as listClients,
  getProject as getClient,
  updateProject as updateClient,
  proxyAction,
  startProjectOnboarding as startTenantOnboarding,
  getOnboardingJobStatus,
} from "@/services/projects.service";

export {
  listSharedTenants,
  createSharedTenantForProject as createSharedTenantForClient,
  listSharedTenantUnits,
  createSharedTenantUnit,
  updateSharedTenantUnit,
  deleteSharedTenantUnit,
  listSharedTenantUsers,
  createSharedTenantAdmin,
  createSharedTenantOperator,
  createSharedTenantOperatorWithMembership,
  deleteSharedTenantUser,
  updateSharedTenantUser,
  listSharedMemberships,
  createSharedMembership,
  updateSharedMembership,
  deleteSharedMembership,
  verifyPassword,
} from "@/services/runtime-tenants.service";
