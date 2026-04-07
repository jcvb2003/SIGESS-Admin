-- Migration: 20260407160000_multi_account_setup.sql
-- Goal: Setup system settings and multi-account Supabase management

-- 1. Table for Global System Settings (Key/Value)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Seed defaults
INSERT INTO public.system_settings (key, value) VALUES
  ('vercel_token', ''),
  ('vercel_project_id', ''),
  ('resend_api_key', ''),
  ('resend_from_email', 'noreply@sigess.com.br')
ON CONFLICT (key) DO NOTHING;

-- 2. Table for multiple Supabase Management Accounts (PATs)
CREATE TABLE IF NOT EXISTS public.supabase_accounts (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  label            text NOT NULL,
  management_token text NOT NULL,
  max_projects     integer DEFAULT 2,
  active_projects  integer DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- 3. Secure View for supabase_accounts (Masking sensitive token)
CREATE OR REPLACE VIEW public.supabase_accounts_safe AS
SELECT 
    id, 
    label, 
    max_projects, 
    active_projects,
    CASE 
        WHEN length(management_token) > 12 THEN left(management_token, 8) || '...' || right(management_token, 4)
        ELSE '********'
    END as management_token_masked,
    created_at
FROM public.supabase_accounts;

-- 4. RLS Policies
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supabase_accounts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated admins to read/write settings
CREATE POLICY "Allow authenticated read system_settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated update system_settings" ON public.system_settings FOR UPDATE TO authenticated USING (true);

-- Allow authenticated admins to read/write accounts
CREATE POLICY "Allow authenticated read supabase_accounts" ON public.supabase_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert supabase_accounts" ON public.supabase_accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update supabase_accounts" ON public.supabase_accounts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete supabase_accounts" ON public.supabase_accounts FOR DELETE TO authenticated USING (true);

-- 5. Update onboarding_jobs to link with supabase_account
ALTER TABLE public.onboarding_jobs ADD COLUMN IF NOT EXISTS supabase_account_id uuid REFERENCES public.supabase_accounts(id);
