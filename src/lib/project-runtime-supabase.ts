import { createClient } from "@supabase/supabase-js";
import type { SharedDatabase } from "@/services/shared-supabase.types";

export interface RuntimeProjectConnection {
  id: string;
  project_name: string;
  supabase_url: string;
  supabase_publishable_key: string;
  supabase_secret_keys: string | null;
}

const runtimeClientCache = new Map<string, ReturnType<typeof createClient<SharedDatabase>>>();
const runtimeAdminClientCache = new Map<string, ReturnType<typeof createClient<SharedDatabase>>>();

export function getProjectRuntimeSupabase(project: RuntimeProjectConnection) {
  const cacheKey = `${project.id}:runtime`;
  const cached = runtimeClientCache.get(cacheKey);
  if (cached) return cached;

  const key = project.supabase_publishable_key;

  if (!project.supabase_url || !key) {
    throw new Error(`Credenciais runtime ausentes para o projeto ${project.project_name}.`);
  }

  const client = createClient<SharedDatabase>(project.supabase_url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  runtimeClientCache.set(cacheKey, client);
  return client;
}

export function getProjectRuntimeSupabaseAdmin(project: RuntimeProjectConnection) {
  const cacheKey = `${project.id}:admin`;
  const cached = runtimeAdminClientCache.get(cacheKey);
  if (cached) return cached;

  if (!project.supabase_url || !project.supabase_secret_keys) {
    throw new Error(`Chave service_role ausente para o projeto ${project.project_name}.`);
  }

  const client = createClient<SharedDatabase>(project.supabase_url, project.supabase_secret_keys, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  runtimeAdminClientCache.set(cacheKey, client);
  return client;
}
