import { supabase } from "@/lib/supabase";
import { getSharedSupabase, getSharedSupabaseAdmin } from "@/lib/shared-supabase";
import { handleSupabaseError } from "@/services/error.handler";
import { proxyAction } from "@/services/projects.service";
import type {
  SharedTenant,
  TenantUser,
  TenantUnit,
  UserUnitMembership,
  OperatorType,
} from "@/features/clients/types";

// Operações no banco runtime do projeto (shared ou isolated).
// Não conhece projetos nem clientes do Admin central.

/**
 * Para projetos isolated: consulta o runtime DB via proxy e descobre o UUID do
 * tenant runtime, para ser gravado em tenants.runtime_tenant_id.
 */
export async function linkIsolatedProjectRuntime(projectId: string): Promise<{ runtime_tenant_id: string }> {
  return proxyAction(projectId, "get-runtime-tenant-id") as Promise<{ runtime_tenant_id: string }>;
}

export async function listSharedTenants(): Promise<SharedTenant[]> {
  const { data, error } = await getSharedSupabaseAdmin()
    .from("tenants")
    .select("id, code, name")
    .order("name", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as SharedTenant[];
}

export async function createSharedTenantForProject(
  clienteId: string,           // ID do registro em `clientes` a ser vinculado
  input: { name: string; code: string },
): Promise<SharedTenant> {
  const sharedAdmin = getSharedSupabaseAdmin();

  const { data: tenant, error: tenantError } = await sharedAdmin
    .from("tenants")
    .insert({ name: input.name, code: input.code.toLowerCase(), status: "active" })
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

  const seedResults = await Promise.all([
    sharedAdmin.from("configuracao_entidade").insert({ tenant_id: tenantId, unit_id: unitId }),
    sharedAdmin.from("parametros").insert({ tenant_id: tenantId, unit_id: unitId }),
    sharedAdmin.from("parametros_financeiros").insert({ tenant_id: tenantId, unit_id: unitId }),
  ]);

  for (const result of seedResults) {
    if (result.error) throw handleSupabaseError(result.error);
  }

  // Vincula o tenant runtime ao registro central pelo ID exato
  const { error: updateError } = await supabase
    .from("tenants")
    .update({ runtime_tenant_id: tenantId })
    .eq("id", clienteId);

  if (updateError) throw handleSupabaseError(updateError);

  return tenant as SharedTenant;
}

export async function listSharedTenantUnits(tenantId: string): Promise<TenantUnit[]> {
  const { data, error } = await getSharedSupabaseAdmin()
    .from("tenant_units")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as TenantUnit[];
}

export async function createSharedTenantUnit(
  input: Omit<TenantUnit, "id" | "created_at" | "updated_at">,
): Promise<TenantUnit> {
  const { data, error } = await getSharedSupabase()
    .from("tenant_units")
    .insert(input)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as TenantUnit;
}

export async function updateSharedTenantUnit(
  id: string,
  input: Partial<Omit<TenantUnit, "id" | "created_at" | "updated_at">>,
): Promise<TenantUnit> {
  const { data, error } = await getSharedSupabase()
    .from("tenant_units")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as TenantUnit;
}

export async function deleteSharedTenantUnit(id: string): Promise<void> {
  const { error } = await getSharedSupabase().from("tenant_units").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);
}

export async function listSharedTenantUsers(tenantId: string): Promise<TenantUser[]> {
  const { data, error } = await getSharedSupabaseAdmin()
    .from("tenant_users")
    .select("id, tenant_id, user_id, tenant_role, operator_type, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as TenantUser[];
}

export async function createSharedTenantAdmin(input: {
  tenantId: string;
  email: string;
  nome: string;
  password: string;
  autoConfirm?: boolean;
}): Promise<TenantUser> {
  const client = getSharedSupabase();
  const adminClient = getSharedSupabaseAdmin();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.nome.trim();

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
  tenantId: string;
  email: string;
  nome: string;
  password: string;
  operatorType: OperatorType;
  autoConfirm?: boolean;
}): Promise<TenantUser> {
  const client = getSharedSupabase();
  const adminClient = getSharedSupabaseAdmin();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.nome.trim();

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
  tenantId: string;
  unitId: string;
  email: string;
  nome: string;
  password: string;
  operatorType: OperatorType;
  autoConfirm?: boolean;
}): Promise<TenantUser> {
  const tenantUser = await createSharedTenantOperator({
    tenantId: input.tenantId,
    email: input.email,
    nome: input.nome,
    password: input.password,
    operatorType: input.operatorType,
    autoConfirm: input.autoConfirm,
  });

  await createSharedMembership({
    tenant_id: input.tenantId,
    unit_id: input.unitId,
    user_id: tenantUser.user_id,
    is_active: true,
  });

  return tenantUser;
}

export async function deleteSharedTenantUser(input: {
  tenantId: string;
  tenantUserId: string;
  authUserId: string;
}): Promise<void> {
  const client = getSharedSupabase();
  const adminClient = getSharedSupabaseAdmin();

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
  id: string,
  input: Partial<Pick<TenantUser, "operator_type" | "is_active">>,
): Promise<TenantUser> {
  const { data, error } = await getSharedSupabase()
    .from("tenant_users")
    .update(input)
    .eq("id", id)
    .select("id, tenant_id, user_id, tenant_role, operator_type, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .single();

  if (error) throw handleSupabaseError(error);
  return data as TenantUser;
}

export async function listSharedMemberships(tenantId: string): Promise<UserUnitMembership[]> {
  const { data, error } = await getSharedSupabaseAdmin()
    .from("user_unit_memberships")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as UserUnitMembership[];
}

export async function createSharedMembership(
  input: Omit<UserUnitMembership, "id" | "created_at" | "updated_at">,
): Promise<UserUnitMembership> {
  const { data, error } = await getSharedSupabase()
    .from("user_unit_memberships")
    .insert(input)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as UserUnitMembership;
}

export async function updateSharedMembership(
  id: string,
  input: Partial<Omit<UserUnitMembership, "id" | "created_at" | "updated_at">>,
): Promise<UserUnitMembership> {
  const { data, error } = await getSharedSupabase()
    .from("user_unit_memberships")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data as UserUnitMembership;
}

export async function deleteSharedMembership(id: string): Promise<void> {
  const { error } = await getSharedSupabase()
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
