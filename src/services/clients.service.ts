import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";
import type { Client, ClientCreate, ClientUpdate } from "@/features/clients/types";

// Service é puro: sem React, sem queryClient, sem side-effects de UI.

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("entidades")
    .select("id, nome_entidade, email, telefone, supabase_url, supabase_publishable_key, logo_url, assinatura, data_cadastro")
    .order("data_cadastro", { ascending: false });

  if (error) throw handleSupabaseError(error);
  
  return (data || []).map(item => ({
    ...item,
    supabase_secret_keys: null, // Force null on frontend for safety
    assinatura: item.assinatura as "mensal" | "anual"
  })) as Client[];
}

export async function getClient(id: string): Promise<Client> {
  const { data, error } = await supabase
    .from("entidades")
    .select("id, nome_entidade, email, telefone, supabase_url, supabase_publishable_key, logo_url, assinatura, data_cadastro")
    .eq("id", id)
    .single();

  if (error) throw handleSupabaseError(error);
  
  if (!data) throw new Error("Cliente não encontrado");

  return {
    ...data,
    supabase_secret_keys: null, // Force null on frontend for safety
    assinatura: data.assinatura as "mensal" | "anual"
  } as Client;
}

export async function proxyAction(
  clientId: string, 
  action: "list-users" | "list-tables" | "health-check" | "list-buckets", 
  params?: Record<string, unknown>
) {
  const { data, error } = await supabase.functions.invoke("client-proxy", {
    body: { clientId, action, params }
  });

  if (error) throw error;
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
    assinatura: data.assinatura as "mensal" | "anual"
  } as Client;
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
    assinatura: data.assinatura as "mensal" | "anual"
  } as Client;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase.from("entidades").delete().eq("id", id);
  if (error) throw handleSupabaseError(error);
}
