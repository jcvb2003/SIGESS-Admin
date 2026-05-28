import { createClient } from "@supabase/supabase-js";
import type { SharedDatabase } from "@/services/shared-supabase.types";

let sharedSupabaseClient: ReturnType<typeof createClient<SharedDatabase>> | null = null;

export function getSharedSupabase() {
  if (sharedSupabaseClient) {
    return sharedSupabaseClient;
  }

  const sharedSupabaseUrl = import.meta.env.VITE_SUPABASE_URL_SHARED;
  const sharedSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY_SHARED;

  if (!sharedSupabaseUrl || !sharedSupabaseKey) {
    throw new Error("Shared Supabase env vars nao configuradas.");
  }

  sharedSupabaseClient = createClient<SharedDatabase>(
    sharedSupabaseUrl,
    sharedSupabaseKey,
  );

  return sharedSupabaseClient;
}
