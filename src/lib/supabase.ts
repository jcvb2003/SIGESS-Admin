import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/services/supabase.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase env vars não configuradas.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
