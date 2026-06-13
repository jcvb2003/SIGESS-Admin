export interface RuntimeProjectConnection {
  id: string;
  project_name: string;
  supabase_url: string;
  supabase_publishable_key: string;
  supabase_secret_keys: string | null;
}
