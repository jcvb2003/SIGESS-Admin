ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS runtime_topology text,
  ADD COLUMN IF NOT EXISTS runtime_tenants_count integer,
  ADD COLUMN IF NOT EXISTS runtime_units_count integer;

COMMENT ON COLUMN public.tenants.runtime_topology IS
  'Topologia detectada no runtime do projeto: isolated_single, isolated_polo, shared_multi_single, shared_multi_polo ou shared_hybrid.';

COMMENT ON COLUMN public.tenants.runtime_tenants_count IS
  'Quantidade de tenants detectados no runtime do projeto no ultimo snapshot.';

COMMENT ON COLUMN public.tenants.runtime_units_count IS
  'Quantidade total de tenant_units ativas detectadas no runtime do projeto no ultimo snapshot.';
