// Re-exports de conveniência — sem queries diretas ao banco aqui.
// CRUD de projetos → projects.service.ts
// CRUD de clientes comerciais → commercial-tenants.service.ts

export {
  listSharedTenants,
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

export {
  startProjectOnboarding as startTenantOnboarding,
  getOnboardingJobStatus,
  proxyAction,
} from "@/services/projects.service";
