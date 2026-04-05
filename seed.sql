-- SIGESS Seed Data
-- Default data for fresh project initialization

-- 1. PARAMETROS FINANCEIROS
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
  250.00, 
  20.80, 
  100.00, 
  50.00, 
  false, 
  1
) ON CONFLICT DO NOTHING;

-- 2. TIPOS DE COBRANCA
INSERT INTO public.tipos_cobranca (
  categoria, 
  nome, 
  descricao, 
  valor_padrao, 
  obrigatoriedade, 
  ativo
) VALUES (
  'contribuicao', 
  'REAP 2025', 
  'Contribuição anual obrigatória', 
  null, 
  'compulsoria', 
  true
) ON CONFLICT DO NOTHING;

-- 3. PARAMETROS (Documentos/RGP)
INSERT INTO public.parametros (
  nr_publicacao, 
  data_publicacao, 
  local_pesca, 
  inicio_pesca1, 
  final_pesca1, 
  especies_proibidas, 
  localpesca
) VALUES (
  '000', 
  '2024-01-01', 
  'BACIA AMAZONICA', 
  '2026-01-01', 
  '2026-04-30', 
  'ESPÉCIES PROTEGIDAS POR LEI', 
  'PROPRIEDADE DA UNIÃO'
) ON CONFLICT DO NOTHING;

-- 4. ENTIDADE (Placeholder)
INSERT INTO public.entidade (
  nome_entidade, 
  nome_abreviado, 
  cidade, 
  uf, 
  cor_primaria, 
  cor_secundaria
) VALUES (
  'Nova Colônia/Sindicato', 
  'SIGESS', 
  'Cidade', 
  'PA', 
  '160 84% 39%', 
  '152 69% 41%'
) ON CONFLICT DO NOTHING;
