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
 * Para projetos isolated: consulta o runtime DB via proxy e descobre o UUID do
 * tenant runtime, para ser gravado em tenants.runtime_tenant_id.
 */
export async function linkIsolatedProjectRuntime(projectId: string): Promise<{ runtime_tenant_id: string }> {
  return proxyAction(projectId, "get-runtime-tenant-id") as Promise<{ runtime_tenant_id: string }>;
}

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
  const { data, error } = await getProjectRuntimeSupabaseAdmin(project)
    .from("tenants")
    .select("id, code, name")
    .order("name", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as SharedTenant[];
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
  const sharedAdmin = getProjectRuntimeSupabaseAdmin(project);

  const { data: tenant, error: tenantError } = await sharedAdmin
    .from("tenants")
    .insert({
      name: input.name,
      code: input.code.toLowerCase(),
      status: "active",
      acesso_expira_em: input.acesso_expira_em,
      max_socios: input.max_socios,
    })
    .select("id, code, name")
    .single();

  if (tenantError) throw handleSupabaseError(tenantError);

  const tenantId = tenant.id;

  const { data: unit, error: unitError } = await sharedAdmin
    .from("tenant_units")
    .insert({ tenant_id: tenantId, code: "principal", name: "Sede", is_active: true })
    .select("id")
    .single();

  if (unitError) throw handleSupabaseError(unitError);

  const unitId = unit.id;

  await ensureSharedRuntimeScopeRows({
    project,
    tenantId,
    unitId,
    entityName: input.name,
  });

  // Vincula o tenant runtime ao registro central pelo ID exato
  const { error: updateError } = await supabase
    .from("tenants")
    .update({ runtime_tenant_id: tenantId })
    .eq("id", clienteId);

  if (updateError) throw handleSupabaseError(updateError);

  return tenant as SharedTenant;
}

export async function syncSharedTenantLicense(
  project: RuntimeProjectConnection,
  tenantId: string,
  input: { acesso_expira_em: string | null; max_socios: number | null },
): Promise<void> {
  const { error } = await getProjectRuntimeSupabaseAdmin(project)
    .from("tenants")
    .update({
      acesso_expira_em: input.acesso_expira_em,
      max_socios: input.max_socios,
    })
    .eq("id", tenantId);

  if (error) throw handleSupabaseError(error);
}

export async function listSharedTenantUnits(project: RuntimeProjectConnection, tenantId: string): Promise<TenantUnit[]> {
  const { data, error } = await getProjectRuntimeSupabaseAdmin(project)
    .from("tenant_units")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as TenantUnit[];
}

export async function createSharedTenantUnit(
  project: RuntimeProjectConnection,
  input: Omit<TenantUnit, "id" | "created_at" | "updated_at">,
): Promise<TenantUnit> {
  const { data, error } = await getProjectRuntimeSupabase(project)
    .from("tenant_units")
    .insert(input)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  await ensureSharedRuntimeScopeRows({
    project,
    tenantId: input.tenant_id,
    unitId: data.id,
  });
  return data as TenantUnit;
}

export async function updateSharedTenantUnit(
  project: RuntimeProjectConnection,
  id: string,
  input: Partial<Omit<TenantUnit, "id" | "created_at" | "updated_at">>,
): Promise<TenantUnit> {
  const { data, error } = await getProjectRuntimeSupabase(project)
    .from("tenant_units")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as TenantUnit;
}

export async function deleteSharedTenantUnit(project: RuntimeProjectConnection, id: string): Promise<void> {
  const { error } = await getProjectRuntimeSupabase(project).from("tenant_units").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);
}

export async function listSharedTenantUsers(project: RuntimeProjectConnection, tenantId: string): Promise<TenantUser[]> {
  const { data, error } = await getProjectRuntimeSupabaseAdmin(project)
    .from("tenant_users")
    .select("id, tenant_id, user_id, tenant_role, operator_type, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as TenantUser[];
}

export async function createSharedTenantAdmin(input: {
  project: RuntimeProjectConnection;
  tenantId: string;
  email: string;
  nome: string;
  password: string;
  autoConfirm?: boolean;
}): Promise<TenantUser> {
  const client = getProjectRuntimeSupabase(input.project);
  const adminClient = getProjectRuntimeSupabaseAdmin(input.project);
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.nome.trim();

  const { id: resolvedAuthUserId } = await resolveOrCreateRuntimeAuthUser({
    project: input.project,
    email: normalizedEmail,
    nome: normalizedName,
    password: input.password,
    role: "admin",
    autoConfirm: input.autoConfirm,
  });

  const { data: upsertedData, error: upsertError } = await client
    .from("tenant_users")
    .upsert(
      { tenant_id: input.tenantId, user_id: resolvedAuthUserId, tenant_role: "owner", is_active: true },
      { onConflict: "tenant_id,user_id" },
    )
    .select("id, tenant_id, user_id, tenant_role, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .single();

  if (upsertError) throw handleSupabaseError(upsertError);
  return upsertedData as TenantUser;

  const { data: createdUserData, error: createUserError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: input.autoConfirm ?? true,
    user_metadata: { nome: normalizedName },
    app_metadata: { role: "admin" },
  });

  if (createUserError) throw handleSupabaseError(createUserError);

  const authUserId = createdUserData.user?.id;
  if (!authUserId) throw new Error("Não foi possível identificar o usuário criado no projeto shared.");

  const { data, error } = await client
    .from("tenant_users")
    .insert({ tenant_id: input.tenantId, user_id: authUserId, tenant_role: "owner", is_active: true })
    .select("id, tenant_id, user_id, tenant_role, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .single();

  if (error) throw handleSupabaseError(error);
  return data as TenantUser;
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
  const client = getProjectRuntimeSupabase(input.project);
  const adminClient = getProjectRuntimeSupabaseAdmin(input.project);
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.nome.trim();

  const { id: resolvedAuthUserId } = await resolveOrCreateRuntimeAuthUser({
    project: input.project,
    email: normalizedEmail,
    nome: normalizedName,
    password: input.password,
    role: "member",
    autoConfirm: input.autoConfirm,
  });

  const { data: upsertedData, error: upsertError } = await client
    .from("tenant_users")
    .upsert(
      {
        tenant_id: input.tenantId,
        user_id: resolvedAuthUserId,
        tenant_role: "member",
        operator_type: input.operatorType,
        is_active: true,
      },
      { onConflict: "tenant_id,user_id" },
    )
    .select("id, tenant_id, user_id, tenant_role, operator_type, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .single();

  if (upsertError) throw handleSupabaseError(upsertError);
  return upsertedData as TenantUser;

  const { data: createdUserData, error: createUserError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: input.autoConfirm ?? true,
    user_metadata: { nome: normalizedName },
    app_metadata: { role: "member" },
  });

  if (createUserError) throw handleSupabaseError(createUserError);

  const authUserId = createdUserData.user?.id;
  if (!authUserId) throw new Error("Não foi possível identificar o usuário criado no projeto shared.");

  const { data, error } = await client
    .from("tenant_users")
    .insert({
      tenant_id: input.tenantId,
      user_id: authUserId,
      tenant_role: "member",
      operator_type: input.operatorType,
      is_active: true,
    })
    .select("id, tenant_id, user_id, tenant_role, operator_type, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .single();

  if (error) throw handleSupabaseError(error);
  return data as TenantUser;
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
  const client = getProjectRuntimeSupabase(input.project);
  const adminClient = getProjectRuntimeSupabaseAdmin(input.project);

  const { error: membershipsError } = await client
    .from("user_unit_memberships")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("user_id", input.authUserId);

  if (membershipsError) throw handleSupabaseError(membershipsError);

  const { error: tenantUserError } = await client
    .from("tenant_users")
    .delete()
    .eq("id", input.tenantUserId)
    .eq("tenant_id", input.tenantId);

  if (tenantUserError) throw handleSupabaseError(tenantUserError);

  const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(input.authUserId);
  if (authDeleteError) throw handleSupabaseError(authDeleteError);
}

export async function updateSharedTenantUser(
  project: RuntimeProjectConnection,
  id: string,
  input: Partial<Pick<TenantUser, "operator_type" | "is_active">>,
): Promise<TenantUser> {
  const { data, error } = await getProjectRuntimeSupabase(project)
    .from("tenant_users")
    .update(input)
    .eq("id", id)
    .select("id, tenant_id, user_id, tenant_role, operator_type, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .single();

  if (error) throw handleSupabaseError(error);
  return data as TenantUser;
}

export async function listSharedMemberships(project: RuntimeProjectConnection, tenantId: string): Promise<UserUnitMembership[]> {
  const { data, error } = await getProjectRuntimeSupabaseAdmin(project)
    .from("user_unit_memberships")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as UserUnitMembership[];
}

export async function createSharedMembership(
  project: RuntimeProjectConnection,
  input: Omit<UserUnitMembership, "id" | "created_at" | "updated_at">,
): Promise<UserUnitMembership> {
  const { data, error } = await getProjectRuntimeSupabase(project)
    .from("user_unit_memberships")
    .insert(input)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as UserUnitMembership;
}

export async function updateSharedMembership(
  project: RuntimeProjectConnection,
  id: string,
  input: Partial<Omit<UserUnitMembership, "id" | "created_at" | "updated_at">>,
): Promise<UserUnitMembership> {
  const { data, error } = await getProjectRuntimeSupabase(project)
    .from("user_unit_memberships")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as UserUnitMembership;
}

export async function deleteSharedMembership(project: RuntimeProjectConnection, id: string): Promise<void> {
  const { error } = await getProjectRuntimeSupabase(project)
    .from("user_unit_memberships")
    .delete()
    .eq("id", id);

  if (error) throw handleSupabaseError(error);
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
