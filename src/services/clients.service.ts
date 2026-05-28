import { supabase } from "@/lib/supabase";
import { getSharedSupabase } from "@/lib/shared-supabase";
import { handleSupabaseError } from "@/services/error.handler";
import type {
  Client,
  ClientCreate,
  ClientUpdate,
  TenantUser,
  TenantUnit,
  UserProfile,
  UserUnitMembership,
} from "@/features/clients/types";

// Service é puro: sem React, sem queryClient, sem side-effects de UI.

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("entidades")
    .select("id, nome_entidade, tenant_code, deployment_mode, shared_project_ref, shared_tenant_id, email, telefone, supabase_url, supabase_publishable_key, supabase_secret_keys, logo_url, assinatura, data_cadastro, supabase_access_token, acesso_expira_em, max_socios, key_status, last_health_check_at, health_error_detail")
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  
  return (data || []).map(item => ({
    ...item,
    assinatura: item.assinatura as Client["assinatura"]
  })) as Client[];
}

export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase
    .from("entidades")
    .select("id, nome_entidade, tenant_code, deployment_mode, shared_project_ref, shared_tenant_id, email, telefone, supabase_url, supabase_publishable_key, supabase_secret_keys, logo_url, assinatura, data_cadastro, supabase_access_token, acesso_expira_em, max_socios, key_status, last_health_check_at, health_error_detail")
    .eq("id", id)
    .single();

  if (error) throw handleSupabaseError(error);
  
  if (!data) throw new Error("Cliente não encontrado");

  return {
    ...data,
    assinatura: data.assinatura as Client["assinatura"]
  } as Client;
}

export async function proxyAction(
  clientId: string, 
  action: "list-users" | "list-tables" | "health-check" | "list-buckets" | "list-client-members" | "create-client-member" | "update-client-member" | "execute-migration" | "sync-trial-limits" | "get-migrations-status" | "repair-user-sync" | "delete-client-member" | "ban-client-member" | "process-data-import" | "apply-schema-drift", 
  params?: Record<string, unknown>
) {
  const { data, error } = await supabase.functions.invoke("client-proxy", {
    body: { clientId, action, params }
  });

  if (error) {
    // FunctionsHttpError.context is the raw Response — extract the real message
    const ctx = (error as any).context as Response | undefined;
    if (ctx) {
      try {
        const body = await ctx.clone().json();
        if (body?.error) throw new Error(body.error);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== 'body used already') throw parseErr;
      }
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);

  return data;
}

export async function createClient(input: ClientCreate): Promise<Client> {
  const { data, error } = await supabase
    .from("entidades")
    .insert(input)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  
  return {
    ...data,
    assinatura: data.assinatura as Client["assinatura"]
  } as Client;
}

export async function startTenantOnboarding(payload: {
  tenantCode: string;
  tenantLabel: string;
  projectRef: string;
  supabaseAccountId: string;
  adminEmail?: string;
}) {
  const { data, error } = await supabase.functions.invoke("tenant-onboarding", {
    body: payload
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data as { jobId: string };
}

export async function getOnboardingJobStatus(jobId: string) {
  const { data, error } = await supabase
    .from("onboarding_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateClient(id: string, input: ClientUpdate): Promise<Client> {
  const { data, error } = await supabase
    .from("entidades")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  
  return {
    ...data,
    assinatura: data.assinatura as Client["assinatura"]
  } as Client;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("entidades").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);
}

export async function listSharedTenantUnits(tenantId: string): Promise<TenantUnit[]> {
  const { data, error } = await getSharedSupabase()
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

export async function listSharedUserProfiles(): Promise<UserProfile[]> {
  const { data, error } = await getSharedSupabase()
    .from("user_profiles")
    .select("*")
    .order("nome", { ascending: true });

  if (error) throw handleSupabaseError(error);
  return (data || []) as UserProfile[];
}

export async function listSharedTenantUsers(tenantId: string): Promise<TenantUser[]> {
  const { data, error } = await getSharedSupabase()
    .from("tenant_users")
    .select("id, tenant_id, user_id, tenant_role, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
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
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedName = input.nome.trim();

  const { data: createdUserData, error: createUserError } = await client.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: input.autoConfirm ?? true,
    user_metadata: { nome: normalizedName },
    app_metadata: { role: "admin" },
  });

  if (createUserError) throw handleSupabaseError(createUserError);

  const authUserId = createdUserData.user?.id;
  if (!authUserId) {
    throw new Error("Nao foi possivel identificar o usuario criado no projeto shared.");
  }

  const { data, error } = await client
    .from("tenant_users")
    .insert({
      tenant_id: input.tenantId,
      user_id: authUserId,
      tenant_role: "owner",
      is_active: true,
    })
    .select("id, tenant_id, user_id, tenant_role, is_active, created_at, updated_at, user_profiles(id, email, nome, is_active, created_at, updated_at)")
    .single();

  if (error) throw handleSupabaseError(error);

  const { data: existingMembership, error: membershipLookupError } = await client
    .from("user_unit_memberships")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", authUserId)
    .is("unit_id", null)
    .eq("role", "tenant_admin")
    .maybeSingle();

  if (membershipLookupError) throw handleSupabaseError(membershipLookupError);

  if (!existingMembership) {
    const { error: membershipInsertError } = await client
      .from("user_unit_memberships")
      .insert({
        tenant_id: input.tenantId,
        user_id: authUserId,
        unit_id: null,
        role: "tenant_admin",
        is_active: true,
        is_default: false,
      });

    if (membershipInsertError) throw handleSupabaseError(membershipInsertError);
  }

  return data as TenantUser;
}

export async function deleteSharedTenantUser(input: {
  tenantId: string;
  tenantUserId: string;
  authUserId: string;
}): Promise<void> {
  const client = getSharedSupabase();

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

  const { error: authDeleteError } = await client.auth.admin.deleteUser(input.authUserId);
  if (authDeleteError) throw handleSupabaseError(authDeleteError);
}

export async function listSharedMemberships(tenantId: string): Promise<UserUnitMembership[]> {
  const { data, error } = await getSharedSupabase()
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
  if (!user?.email) {
    throw new Error("Sessão expirada ou usuário não autenticado.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: password,
  });

  if (error) {
    throw new Error("Senha incorreta. Verificação falhou.");
  }

  return true;
}
