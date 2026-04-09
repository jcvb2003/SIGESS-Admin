-- Adicionar campos de health check para os tenants
-- Permite detectar chaves service_role inválidas ou revogadas

ALTER TABLE public.entidades
  ADD COLUMN key_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (key_status IN ('valid', 'broken', 'unknown')),
  ADD COLUMN last_health_check_at TIMESTAMPTZ,
  ADD COLUMN health_error_detail TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.entidades.key_status IS 'Status da conexão com o Supabase do cliente (service_role_key)';
COMMENT ON COLUMN public.entidades.last_health_check_at IS 'Data/hora da última verificação de saúde bem sucedida ou falha';
COMMENT ON COLUMN public.entidades.health_error_detail IS 'Detalhes do erro caso o status seja broken';

-- Forçar um refresh do cache do PostgREST (se necessário)
NOTIFY pgrst, 'reload schema';
