-- SIGESS Seed Data
-- Default data for fresh project initialization

-- 1. PARAMETROS FINANCEIROS (Seed Zero)
INSERT INTO public.parametros_financeiros (
  regime_padrao, 
  dia_vencimento, 
  ano_base_cobranca, 
  valor_anuidade, 
  valor_mensalidade, 
  valor_inscricao, 
  valor_transferencia, 
  bloquear_inadimplente, 
  anos_atraso_alerta
) VALUES (
  'anuidade', 
  1, 
  2026, 
  0.00, 
  0.00, 
  0.00, 
  0.00, 
  false, 
  1
) ON CONFLICT DO NOTHING;

-- 2. ENTIDADE (Padrao SIGESS)
INSERT INTO public.entidade (
  nome_entidade, 
  nome_abreviado
) VALUES (
  'Nova Entidade SIGESS', 
  'SIGESS'
) ON CONFLICT DO NOTHING;

-- 3. CONFIGURACAO (Eixo C) — inclui cores (migradas de entidade via 20260422_ph4_branding_redesign)
INSERT INTO public.configuracao_entidade (id, max_socios, cor_primaria, cor_secundaria, cor_sidebar)
VALUES (1, 100, '160 84% 39%', '152 69% 41%', '0 0% 98%')
ON CONFLICT DO NOTHING;