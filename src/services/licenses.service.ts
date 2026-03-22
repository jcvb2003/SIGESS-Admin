import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "./error.handler";
import type { License, LicenseCreate } from "@/features/licenses/types";

export const licensesService = {
  async list(): Promise<License[]> {
    const { data, error } = await (supabase as any)
      .from("licenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw handleSupabaseError(error);
    return data as License[];
  },

  async create(license: LicenseCreate): Promise<License> {
    const { data, error } = await (supabase as any)
      .from("licenses")
      .insert(license)
      .select()
      .single();

    if (error) throw handleSupabaseError(error);
    return data as License;
  },

  async update(key: string, updates: Partial<License>): Promise<License> {
    const { data, error } = await (supabase as any)
      .from("licenses")
      .update(updates)
      .eq("key", key)
      .select()
      .single();

    if (error) throw handleSupabaseError(error);
    return data as License;
  },

  async delete(key: string): Promise<void> {
    const { error } = await (supabase as any)
      .from("licenses")
      .delete()
      .eq("key", key);

    if (error) throw handleSupabaseError(error);
  }
};
