import { supabase } from "@/lib/supabase";
import {
  getProjectRuntimeSupabase,
  getProjectRuntimeSupabaseAdmin,
  type RuntimeProjectConnection,
} from "@/lib/project-runtime-supabase";
import { handleSupabaseError } from "@/services/error.handler";
import { proxyAction } from "@/services/projects.service";
import type {
  SharedTenant,
  TenantUser,
  TenantUnit,
  UserUnitMembership,
  OperatorType,
  Topology,
} from "@/features/clients/types";

async function ensureRuntimeUserProfile(
  project: RuntimeProjectConnection,
  input: { userId: string; email: string; nome: string },
): Promise<void> {
  const { error } = await getProjectRuntimeSupabaseAdmin(project)
    .from("user_profiles")
    .upsert(
      {
        id: input.userId,
        email: input.email,
        nome: input.nome,
        is_active: true,
      },
      { onConflict: "id" },
    );

  if (error) throw handleSupabaseError(error);
}

async function resolveOrCreateRuntimeAuthUser(input: {
  project: RuntimeProjectConnection;
  email: string;
  nome: string;
  password: string;
  role: "admin" | "member";
  autoConfirm?: boolean;
}): Promise<{ id: string }> {
  const adminClient = getProjectRuntimeSupabaseAdmin(input.project);
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.nome.trim();

  const { data: createdUserData, error: createUserError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: input.autoConfirm ?? true,
    user_metadata: { nome: normalizedName },
    app_metadata: { role: input.role },
  });

  if (!createUserError && createdUserData.user?.id) {
    await ensureRuntimeUserProfile(input.project, {
      userId: createdUserData.user.id,
      email: normalizedEmail,
      nome: normalizedName,
    });
    return { id: createdUserData.user.id };
  }

  if (createUserError?.message?.includes("already been registered")) {
    const { data: listedUsers, error: listUsersError } = await adminClient.auth.admin.listUsers();
    if (listUsersError) throw handleSupabaseError(listUsersError);

    const existingUser = listedUsers.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (!existingUser?.id) throw handleSupabaseError(createUserError);

    await ensureRuntimeUserProfile(input.project, {
      userId: existingUser.id,
      email: normalizedEmail,
      nome: normalizedName,
    });
    return { id: existingUser.id };
  }

  throw handleSupabaseError(createUserError);
}

// Operações no banco runtime do projeto (shared ou isolated).
// Não conhece projetos nem clientes do Admin central.

/**
 * Consulta o runtime via proxy e devolve um snapshot enxuto do estado
 * operacional. Em projetos isolated, tambem atualiza automaticamente o
 * runtime_tenant_id e o supports_units no espelho do Admin.
 */
export interface RuntimeProjectMetadata {
  runtime_tenant_id: string | null;
  runtime_tenants_count: number;
  runtime_units_count: number;
  supports_units: boolean;
  runtime_topology: Topology | null;
}

export async function syncProjectRuntimeMetadata(projectId: string): Promise<RuntimeProjectMetadata> {
  return proxyAction(projectId, "get-runtime-tenant-id") as Promise<RuntimeProjectMetadata>;
}

/** @deprecated use syncProjectRuntimeMetadata */
export const linkIsolatedProjectRuntime = syncProjectRuntimeMetadata;

export async function syncIsolatedProjectLicense(
  projectId: string,
  input: { acesso_expira_em: string | null; max_socios: number | null },
): Promise<void> {
  await proxyAction(projectId, "sync-trial-limits", {
    acessoExpiraEm: input.acesso_expira_em,
    maxSocios: input.max_socios,
  });
}

export async function listSharedTenants(project: RuntimeProjectConnection): Promise<SharedTenant[]> {
  return await proxyAction(project.id, "list-shared-tenants") as SharedTenant[];
}

async function ensureSharedRuntimeScopeRows(input: {
  project: RuntimeProjectConnection;
  tenantId: string;
  unitId: string;
  entityName?: string | null;
}) {
  const sharedAdmin = getProjectRuntimeSupabaseAdmin(input.project);

  const [{ data: existingEntity }, { data: existingConfig }, { data: existingParametros }, { data: existingFinanceiros }] =
    await Promise.all([
      sharedAdmin
        .from("entidade")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("unit_id", input.unitId)
        .limit(1)
        .maybeSingle(),
      sharedAdmin
        .from("configuracao_entidade")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("unit_id", input.unitId)
        .limit(1)
        .maybeSingle(),
      sharedAdmin
        .from("parametros")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("unit_id", input.unitId)
        .limit(1)
        .maybeSingle(),
      sharedAdmin
        .from("parametros_financeiros")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("unit_id", input.unitId)
        .limit(1)
        .maybeSingle(),
    ]);

  const inserts = [];

  if (!existingEntity) {
    inserts.push(
      sharedAdmin.from("entidade").insert({
        tenant_id: input.tenantId,
        unit_id: input.unitId,
        nome_entidade: input.entityName ?? null,
      }),
    );
  }

  if (!existingConfig) {
    inserts.push(
      sharedAdmin.from("configuracao_entidade").insert({
        tenant_id: input.tenantId,
        unit_id: input.unitId,
      }),
    );
  }

  if (!existingParametros) {
    inserts.push(
      sharedAdmin.from("parametros").insert({
        tenant_id: input.tenantId,
        unit_id: input.unitId,
      }),
    );
  }

  if (!existingFinanceiros) {
    inserts.push(
      sharedAdmin.from("parametros_financeiros").insert({
        tenant_id: input.tenantId,
        unit_id: input.unitId,
      }),
    );
  }

  const results = await Promise.all(inserts);
  for (const result of results) {
    if (result.error) throw handleSupabaseError(result.error);
  }
}

export async function createSharedTenantForProject(
  project: RuntimeProjectConnection,
  clienteId: string,           // ID do registro em `clientes` a ser vinculado
  input: { name: string; code: string; acesso_expira_em: string | null; max_socios: number | null },
): Promise<SharedTenant> {
  return await proxyAction(project.id, "create-shared-tenant", {
    clienteId,
    name: input.name,
    code: input.code.toLowerCase(),
    acessoExpiraEm: input.acesso_expira_em,
    maxSocios: input.max_socios,
  }) as SharedTenant;
}

export async function syncSharedTenantLicense(
  project: RuntimeProjectConnection,
  tenantId: string,
  input: { acesso_expira_em: string | null; max_socios: number | null },
): Promise<void> {
  await proxyAction(project.id, "sync-shared-tenant-license", {
    tenantId,
    acessoExpiraEm: input.acesso_expira_em,
    maxSocios: input.max_socios,
  });
}

export async function listSharedTenantUnits(project: RuntimeProjectConnection, tenantId: string): Promise<TenantUnit[]> {
  return await proxyAction(project.id, "list-shared-tenant-units", { tenantId }) as TenantUnit[];
}

export async function createSharedTenantUnit(
  project: RuntimeProjectConnection,
  input: Omit<TenantUnit, "id" | "created_at" | "updated_at">,
): Promise<TenantUnit> {
  return await proxyAction(project.id, "create-shared-tenant-unit", {
    payload: input,
  }) as TenantUnit;
}

export async function updateSharedTenantUnit(
  project: RuntimeProjectConnection,
  id: string,
  input: Partial<Omit<TenantUnit, "id" | "created_at" | "updated_at">>,
): Promise<TenantUnit> {
  return await proxyAction(project.id, "update-shared-tenant-unit", {
    id,
    payload: input,
  }) as TenantUnit;
}

export async function deleteSharedTenantUnit(project: RuntimeProjectConnection, id: string): Promise<void> {
  await proxyAction(project.id, "delete-shared-tenant-unit", { id });
}

export async function listSharedTenantUsers(project: RuntimeProjectConnection, tenantId: string): Promise<TenantUser[]> {
  return await proxyAction(project.id, "list-shared-tenant-users", { tenantId }) as TenantUser[];
}

export async function createSharedTenantAdmin(input: {
  project: RuntimeProjectConnection;
  tenantId: string;
  email: string;
  nome: string;
  password: string;
  autoConfirm?: boolean;
}): Promise<TenantUser> {
  return await proxyAction(input.project.id, "create-shared-tenant-admin", {
    tenantId: input.tenantId,
    email: input.email,
    nome: input.nome,
    password: input.password,
    autoConfirm: input.autoConfirm,
  }) as TenantUser;
}

export async function createSharedTenantOperator(input: {
  project: RuntimeProjectConnection;
  tenantId: string;
  email: string;
  nome: string;
  password: string;
  operatorType: OperatorType;
  autoConfirm?: boolean;
}): Promise<TenantUser> {
  return await proxyAction(input.project.id, "create-shared-tenant-operator", {
    tenantId: input.tenantId,
    email: input.email,
    nome: input.nome,
    password: input.password,
    operatorType: input.operatorType,
    autoConfirm: input.autoConfirm,
  }) as TenantUser;
}

export async function createSharedTenantOperatorWithMembership(input: {
  project: RuntimeProjectConnection;
  tenantId: string;
  unitId: string;
  email: string;
  nome: string;
  password: string;
  operatorType: OperatorType;
  autoConfirm?: boolean;
}): Promise<TenantUser> {
  const tenantUser = await createSharedTenantOperator({
    project: input.project,
    tenantId: input.tenantId,
    email: input.email,
    nome: input.nome,
    password: input.password,
    operatorType: input.operatorType,
    autoConfirm: input.autoConfirm,
  });

  await createSharedMembership({
    project: input.project,
    tenant_id: input.tenantId,
    unit_id: input.unitId,
    user_id: tenantUser.user_id,
    is_active: true,
  });

  return tenantUser;
}

export async function deleteSharedTenantUser(input: {
  project: RuntimeProjectConnection;
  tenantId: string;
  tenantUserId: string;
  authUserId: string;
}): Promise<void> {
  await proxyAction(input.project.id, "delete-shared-tenant-user", {
    tenantId: input.tenantId,
    tenantUserId: input.tenantUserId,
    authUserId: input.authUserId,
  });
}

export async function updateSharedTenantUser(
  project: RuntimeProjectConnection,
  id: string,
  input: Partial<Pick<TenantUser, "operator_type" | "is_active">>,
): Promise<TenantUser> {
  return await proxyAction(project.id, "update-shared-tenant-user", {
    id,
    payload: input,
  }) as TenantUser;
}

export async function listSharedMemberships(project: RuntimeProjectConnection, tenantId: string): Promise<UserUnitMembership[]> {
  return await proxyAction(project.id, "list-shared-memberships", { tenantId }) as UserUnitMembership[];
}

export async function createSharedMembership(
  project: RuntimeProjectConnection,
  input: Omit<UserUnitMembership, "id" | "created_at" | "updated_at">,
): Promise<UserUnitMembership> {
  return await proxyAction(project.id, "create-shared-membership", {
    payload: input,
  }) as UserUnitMembership;
}

export async function updateSharedMembership(
  project: RuntimeProjectConnection,
  id: string,
  input: Partial<Omit<UserUnitMembership, "id" | "created_at" | "updated_at">>,
): Promise<UserUnitMembership> {
  return await proxyAction(project.id, "update-shared-membership", {
    id,
    payload: input,
  }) as UserUnitMembership;
}

export async function deleteSharedMembership(project: RuntimeProjectConnection, id: string): Promise<void> {
  await proxyAction(project.id, "delete-shared-membership", { id });
}

export async function verifyPassword(password: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error("Sessão expirada ou usuário não autenticado.");

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (error) throw new Error("Senha incorreta. Verificação falhou.");
  return true;
}
