import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";
import { Tables, TablesInsert, TablesUpdate } from "./supabase.types";

export type SupabaseAccount = Tables<"supabase_accounts">;
export type SupabaseAccountSafe = Tables<"supabase_accounts_safe">;
export type SystemSetting = Tables<"system_settings">;

export async function listSupabaseAccounts(): Promise<SupabaseAccountSafe[]> {
  const { data, error } = await supabase
    .from("supabase_accounts_safe")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw handleSupabaseError(error);
  return data as SupabaseAccountSafe[];
}

export async function createSupabaseAccount(account: TablesInsert<"supabase_accounts">) {
  // 1. Validate Token first
  if (account.management_token) {
    await validateSupabaseToken(account.management_token);
  }

  const { data, error } = await supabase
    .from("supabase_accounts")
    .insert(account)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data;
}

export async function updateSupabaseAccount(id: string, account: TablesUpdate<"supabase_accounts">) {
  if (account.management_token) {
    await validateSupabaseToken(account.management_token);
  }

  const { data, error } = await supabase
    .from("supabase_accounts")
    .update(account)
    .eq("id", id)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data;
}

export async function deleteSupabaseAccount(id: string) {
  const { error } = await supabase
    .from("supabase_accounts")
    .delete()
    .eq("id", id);

  if (error) throw handleSupabaseError(error);
}

export async function listSystemSettings(): Promise<SystemSetting[]> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("*");

  if (error) throw handleSupabaseError(error);
  return data || [];
}

export async function updateSystemSetting(key: string, value: string) {
  const { data, error } = await supabase
    .from("system_settings")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return data;
}

export async function validateSupabaseToken(token: string) {
  const { data, error } = await supabase.functions.invoke("validate-token", {
    body: { token }
  });
  
  if (error || !data?.valid) {
    throw new Error(data?.message || error?.message || "Token do Supabase inválido.");
  }
  
  return data;
}
