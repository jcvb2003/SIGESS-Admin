import { supabase } from "@/lib/supabase";
import { handleSupabaseError } from "@/services/error.handler";

const BUCKET = "backups";

export interface BackupFile {
  name: string;
  size: number | null;
  created_at: string | null;
  path: string;
}

export function extractProjectRef(supabaseUrl: string): string {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0];
  } catch {
    return "";
  }
}

export async function listBackupTenants(projectRef: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(projectRef);
  if (error) throw handleSupabaseError(error);
  return (data ?? []).filter((item) => !item.metadata).map((item) => item.name);
}

export async function listBackupDates(projectRef: string, tenantCode: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(`${projectRef}/${tenantCode}`);
  if (error) throw handleSupabaseError(error);
  return (data ?? []).filter((item) => !item.metadata).map((item) => item.name).sort().reverse();
}

export async function listBackupFiles(
  projectRef: string,
  tenantCode: string,
  date: string,
): Promise<BackupFile[]> {
  const prefix = `${projectRef}/${tenantCode}/${date}`;
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix);
  if (error) throw handleSupabaseError(error);
  return (data ?? [])
    .filter((item) => item.metadata)
    .map((item) => ({
      name: item.name,
      size: item.metadata?.size ?? null,
      created_at: item.created_at ?? null,
      path: `${prefix}/${item.name}`,
    }));
}

export async function getBackupDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw handleSupabaseError(error);
  return data.signedUrl;
}
