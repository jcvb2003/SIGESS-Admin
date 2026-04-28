-- SIGESS INITIAL SCHEMA
-- FONTE: SINPESCA-OEIRAS (tnrzxuznerneilxoojgv)
-- RECONSTRUÇÃO TOTAL "ZERO ABSOLUTO"

-- 1. PREAMBULO E EXTENSOES
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Criar schema de extensões e configurar path
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA extensions;

SELECT pg_catalog.set_config('search_path', 'public, extensions', false);

-- 2. FUNCOES UTILITARIAS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- 3. TABELAS BASE

-- User (Sync com Auth)
CREATE TABLE IF NOT EXISTS public."User" (
    id uuid PRIMARY KEY,
    email text,
    role text DEFAULT 'user'::text,
    nome text,
    ativo boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Localidades
CREATE TABLE IF NOT EXISTS public.localidades (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo_localidade text UNIQUE,
    nome text
);

-- Entidade
CREATE TABLE IF NOT EXISTS public.entidade (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nome_entidade text,
    nome_abreviado text,
    endereco text,
    bairro text,
    cidade text,
    uf text,
    cep text,
    fone text,
    celular text,
    cnpj text,
    federacao text,
    confederacao text,
    polo text,
    fundacao date,
    email text,
    comarca text,
    numero text,
    nome_do_presidente text,
    cpf_do_presidente text
);

-- Socios
CREATE TABLE IF NOT EXISTS public.socios (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo_do_socio text,
    data_de_admissao date,
    codigo_localidade text,
    data_de_nascimento date,
    nome text,
    apelido text,
    pai text,
    mae text,
    estado_civil text,
    nacionalidade text,
    naturalidade text,
    uf_naturalidade text,
    endereco text,
    num text,
    bairro text,
    cidade text,
    uf text,
    cep text,
    telefone text,
    alfabetizado text,
    escolaridade text,
    rg text,
    dt_expedicao_rg date,
    cpf text NOT NULL UNIQUE,
    titulo text,
    zona text,
    secao text,
    num_rgp text,
    rgp_uf text,
    nit text,
    cei text,
    caepf text,
    emissao_rgp date,
    situacao text,
    sexo text,
    email text,
    senhagov_inss text,
    observacoes text,
    tipo_rgp text,
    uf_rg text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Requerimentos
CREATE TABLE IF NOT EXISTS public.requerimentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cod_req text UNIQUE,
    data_assinatura date,
    cpf text,
    ano_referencia integer,
    status_mte text DEFAULT 'assinado'::text,
    data_envio date,
    num_req_mte text,
    beneficio_recebido boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT unique_cpf_ano UNIQUE (cpf, ano_referencia)
);

-- Parametros Financeiros
CREATE TABLE IF NOT EXISTS public.parametros_financeiros (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    regime_padrao text DEFAULT 'anuidade'::text,
    dia_vencimento integer DEFAULT 1,
    ano_base_cobranca integer DEFAULT 2024,
    valor_anuidade numeric,
    valor_mensalidade numeric,
    valor_inscricao numeric,
    valor_transferencia numeric,
    bloquear_inadimplente boolean DEFAULT true,
    anos_atraso_alerta integer DEFAULT 1,
    cobra_multa boolean DEFAULT false,
    percentual_multa numeric,
    cobra_juros boolean DEFAULT false,
    percentual_juros_mes numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Tipos de Cobranca
CREATE TABLE IF NOT EXISTS public.tipos_cobranca (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria text NOT NULL,
    nome text NOT NULL,
    descricao text,
    valor_padrao numeric,
    obrigatoriedade text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Financeiro: Lancamentos
CREATE TABLE IF NOT EXISTS public.financeiro_lancamentos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    socio_cpf text NOT NULL,
    sessao_id uuid DEFAULT gen_random_uuid(),
    tipo text NOT NULL,
    tipo_cobranca_id uuid,
    competencia_ano integer,
    competencia_mes integer,
    valor numeric NOT NULL,
    forma_pagamento text NOT NULL,
    descricao text,
    status text DEFAULT 'pago'::text,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    registrado_por uuid,
    data_pagamento date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Financeiro: Cobrancas Geradas
CREATE TABLE IF NOT EXISTS public.financeiro_cobrancas_geradas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo_cobranca_id uuid NOT NULL,
    socio_cpf text NOT NULL,
    valor numeric NOT NULL,
    data_lancamento date DEFAULT CURRENT_DATE,
    data_vencimento date,
    lancamento_id uuid,
    status text DEFAULT 'pendente'::text,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Financeiro: DAE
CREATE TABLE IF NOT EXISTS public.financeiro_dae (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    socio_cpf text NOT NULL,
    tipo_boleto text NOT NULL,
    competencia_ano integer NOT NULL,
    competencia_mes integer NOT NULL,
    grupo_id uuid,
    sessao_id uuid,
    valor numeric NOT NULL,
    forma_pagamento text NOT NULL,
    boleto_pago boolean DEFAULT false,
    data_pagamento_boleto date,
    status text DEFAULT 'pago'::text,
    registrado_por uuid,
    data_recebimento date DEFAULT CURRENT_DATE,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Financeiro: Configuracao Socio
CREATE TABLE IF NOT EXISTS public.financeiro_config_socio (
    cpf text PRIMARY KEY,
    regime text,
    referencia_vencimento text,
    dia_vencimento integer,
    isento boolean DEFAULT false,
    motivo_isencao text,
    liberado_pelo_presidente boolean DEFAULT false,
    liberacao_observacao text,
    liberacao_data timestamp with time zone,
    liberacao_usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    socio_historico boolean DEFAULT false
);

-- Financeiro: Historico Regime
CREATE TABLE IF NOT EXISTS public.financeiro_historico_regime (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    socio_cpf text NOT NULL,
    regime text NOT NULL,
    vigente_desde date NOT NULL,
    vigente_ate date,
    alterado_por uuid,
    observacao text,
    created_at timestamp with time zone DEFAULT now()
);

-- Audit Log Financeiro
CREATE TABLE IF NOT EXISTS public.audit_log_financeiro (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    changed_by uuid,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    operation text NOT NULL,
    old_data jsonb,
    new_data jsonb
);

-- Configuracao Entidade
CREATE TABLE IF NOT EXISTS public.configuracao_entidade (
    id integer DEFAULT 1 PRIMARY KEY CHECK (id = 1),
    max_socios integer DEFAULT 100,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    acesso_expira_em timestamp with time zone,
    extensao_license_key text,
    cor_primaria text DEFAULT '160 84% 39%'::text,
    cor_secundaria text DEFAULT '152 69% 41%'::text,
    cor_sidebar text DEFAULT '160 84% 39%'::text,
    logo_path text
);

-- REAP
CREATE TABLE IF NOT EXISTS public.reap (
    cpf text PRIMARY KEY,
    simplificado jsonb DEFAULT '{}'::jsonb,
    anual jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    observacoes text
);

-- Parametros (Regulamentação)
CREATE TABLE IF NOT EXISTS public.parametros (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    nr_publicacao text,
    data_publicacao text,
    local_pesca text,
    inicio_pesca1 text,
    final_pesca1 text,
    inicio_pesca2 text,
    final_pesca2 text,
    especies_proibidas text,
    localpesca text
);

-- Templates
CREATE TABLE IF NOT EXISTS public.templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text,
    document_type text,
    file_path text,
    file_url text,
    file_size bigint,
    content_type text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    font_configurations text
);

-- Logs Requerimento
CREATE TABLE IF NOT EXISTS public.logs_eventos_requerimento (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    requerimento_id uuid,
    tipo_evento text,
    descricao text,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

-- Foto Upload Tokens
CREATE TABLE IF NOT EXISTS public.foto_upload_tokens (
    token uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    socio_cpf text,
    foto_base64 text,
    foto_url text,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- 4. CONSTRAINTS DE CHAVE ESTRANGEIRA
ALTER TABLE ONLY public.requerimentos ADD CONSTRAINT requerimentos_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf);
ALTER TABLE ONLY public.financeiro_lancamentos ADD CONSTRAINT financeiro_lancamentos_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);
ALTER TABLE ONLY public.financeiro_lancamentos ADD CONSTRAINT financeiro_lancamentos_tipo_cobranca_id_fkey FOREIGN KEY (tipo_cobranca_id) REFERENCES public.tipos_cobranca(id);
ALTER TABLE ONLY public.financeiro_lancamentos ADD CONSTRAINT financeiro_lancamentos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public."User"(id);
ALTER TABLE ONLY public.financeiro_cobrancas_geradas ADD CONSTRAINT financeiro_cobrancas_geradas_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);
ALTER TABLE ONLY public.financeiro_cobrancas_geradas ADD CONSTRAINT financeiro_cobrancas_geradas_tipo_cobranca_id_fkey FOREIGN KEY (tipo_cobranca_id) REFERENCES public.tipos_cobranca(id);
ALTER TABLE ONLY public.financeiro_cobrancas_geradas ADD CONSTRAINT financeiro_cobrancas_geradas_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.financeiro_lancamentos(id);
ALTER TABLE ONLY public.financeiro_dae ADD CONSTRAINT financeiro_dae_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);
ALTER TABLE ONLY public.financeiro_dae ADD CONSTRAINT financeiro_dae_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public."User"(id);
ALTER TABLE ONLY public.financeiro_config_socio ADD CONSTRAINT financeiro_config_socio_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf);
ALTER TABLE ONLY public.financeiro_historico_regime ADD CONSTRAINT financeiro_historico_regime_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);
ALTER TABLE ONLY public.reap ADD CONSTRAINT reap_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf);
ALTER TABLE ONLY public.logs_eventos_requerimento ADD CONSTRAINT logs_eventos_requerimento_requerimento_id_fkey FOREIGN KEY (requerimento_id) REFERENCES public.requerimentos(id);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_socios_nome_trgm ON public.socios USING gin (nome extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_socios_cpf_trgm ON public.socios USING gin (cpf extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_socios_birth_month ON public.socios USING btree (EXTRACT(month FROM data_de_nascimento));
CREATE UNIQUE INDEX IF NOT EXISTS financeiro_dae_active_month_idx ON public.financeiro_dae (socio_cpf, competencia_ano, competencia_mes) WHERE (status <> 'cancelado'::text);
CREATE INDEX IF NOT EXISTS idx_dae_socio ON public.financeiro_dae (socio_cpf);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_anuidade_por_ano ON public.financeiro_lancamentos (socio_cpf, competencia_ano) WHERE ((tipo = 'anuidade'::text) AND (status = 'pago'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mensalidade_por_mes ON public.financeiro_lancamentos (socio_cpf, competencia_ano, competencia_mes) WHERE ((tipo = 'mensalidade'::text) AND (status = 'pago'::text));

-- 6. FUNCOES DE NEGOCIO (RPCs)

CREATE OR REPLACE FUNCTION public.generate_next_codigo_localidade()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  max_code_val integer;
  next_code text;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo_localidade, '[^0-9]', '', 'g'), '')::integer), 0) INTO max_code_val FROM public.localidades;
  next_code := LPAD((max_code_val + 1)::text, 3, '0');
  IF NEW.codigo_localidade IS NULL OR NEW.codigo_localidade = '' THEN
    NEW.codigo_localidade := next_code;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_next_cod_req()
 RETURNS text LANGUAGE plpgsql AS $function$
DECLARE
    next_code INTEGER;
    formatted_code TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(cod_req AS INTEGER)), 0) + 1 INTO next_code FROM public.requerimentos WHERE cod_req ~ '^[0-9]+$';
    formatted_code := LPAD(next_code::text, 6, '0');
    RETURN formatted_code;
END; $function$;

CREATE OR REPLACE FUNCTION public.auto_generate_cod_req()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF NEW.cod_req IS NULL OR NEW.cod_req = '' THEN
        NEW.cod_req := public.get_next_cod_req();
    END IF;
    RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.proc_audit_finance_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
    INSERT INTO public.audit_log_financeiro (table_name, record_id, operation, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, TG_OP, 
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END, 
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END, auth.uid());
    RETURN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.check_member_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
    v_limit integer;
    v_count integer;
BEGIN
    SELECT max_socios INTO v_limit FROM public.configuracao_entidade LIMIT 1;
    v_limit := COALESCE(v_limit, 100);
    SELECT COUNT(*) INTO v_count FROM public.socios WHERE situacao != 'Excluido';
    IF v_count >= v_limit AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.situacao = 'Excluido' AND NEW.situacao != 'Excluido')) THEN
        RAISE EXCEPTION 'Limite de socios atingido (%)', v_limit;
    END IF;
    RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_socio_financial_status(p_cpf text, p_regime text, p_isento boolean, p_liberado boolean)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
    v_current_year int := EXTRACT(year FROM CURRENT_DATE);
    v_current_month int := EXTRACT(month FROM CURRENT_DATE);
BEGIN
    IF p_isento OR p_liberado THEN RETURN 'ISENTO'; END IF;
    IF p_regime = 'anuidade' THEN
        IF EXISTS (SELECT 1 FROM public.financeiro_lancamentos WHERE socio_cpf = p_cpf AND tipo = 'anuidade' AND competencia_ano = v_current_year AND status = 'pago') THEN
            RETURN 'EM_DIA';
        ELSE RETURN 'EM_ATRASO'; END IF;
    ELSIF p_regime = 'mensalidade' THEN
        IF NOT EXISTS (SELECT 1 FROM generate_series(1, v_current_month) m WHERE NOT EXISTS (SELECT 1 FROM public.financeiro_lancamentos WHERE socio_cpf = p_cpf AND tipo = 'mensalidade' AND competencia_ano = v_current_year AND competencia_mes = m AND status = 'pago')) THEN
            RETURN 'EM_DIA';
        ELSE RETURN 'EM_ATRASO'; END IF;
    ELSE RETURN 'EM_ATRASO'; END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.reap_batch_upsert_simplificado_v2(p_entries jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  entry jsonb; v_cpf text; v_simplificado jsonb; v_ano text; v_ano_data jsonb;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_cpf := entry->>'cpf'; v_simplificado := entry->'simplificado';
    INSERT INTO public.reap (cpf, simplificado) VALUES (v_cpf, v_simplificado) ON CONFLICT (cpf) DO NOTHING;
    FOR v_ano, v_ano_data IN SELECT * FROM jsonb_each(v_simplificado) LOOP
      UPDATE public.reap SET simplificado = simplificado || jsonb_build_object(v_ano, COALESCE(simplificado -> v_ano, '{"enviado": false, "tem_problema": false, "obs": null}'::jsonb) || v_ano_data), updated_at = now() WHERE cpf = v_cpf;
    END LOOP;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.reap_batch_upsert_anual_v2(p_entries jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  entry jsonb; v_cpf text; v_anual jsonb; v_ano text; v_ano_data jsonb;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_cpf := entry->>'cpf'; v_anual := entry->'anual';
    INSERT INTO public.reap (cpf, anual) VALUES (v_cpf, v_anual) ON CONFLICT (cpf) DO NOTHING;
    FOR v_ano, v_ano_data IN SELECT * FROM jsonb_each(v_anual) LOOP
      UPDATE public.reap SET anual = anual || jsonb_build_object(v_ano, COALESCE(anual -> v_ano, '{"enviado": false, "tem_problema": false, "data_envio": null, "obs": null}'::jsonb) || v_ano_data), updated_at = now() WHERE cpf = v_cpf;
    END LOOP;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.register_payment_session(p_socio_cpf text, p_sessao_id uuid, p_forma_pagamento text, p_data_pagamento date, p_itens jsonb, p_daes jsonb DEFAULT '[]'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_item jsonb; v_dae jsonb; v_daes_array jsonb := COALESCE(p_daes, '[]'::jsonb); v_user_id uuid := auth.uid(); v_grupo_id uuid := NULL;
BEGIN
  IF jsonb_array_length(v_daes_array) > 0 THEN IF (v_daes_array->0->>'tipo_boleto') != 'unitario' THEN v_grupo_id := gen_random_uuid(); END IF; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    INSERT INTO public.financeiro_lancamentos (socio_cpf, sessao_id, tipo, valor, forma_pagamento, data_pagamento, competencia_ano, competencia_mes, tipo_cobranca_id, descricao, registrado_por)
    VALUES (p_socio_cpf, p_sessao_id, (v_item->>'tipo'), (v_item->>'valor')::numeric, p_forma_pagamento, p_data_pagamento, (v_item->>'competencia_ano')::integer, (v_item->>'competencia_mes')::integer, CASE WHEN (v_item->>'tipo_cobranca_id') = '' THEN NULL ELSE (v_item->>'tipo_cobranca_id')::uuid END, (v_item->>'descricao'), v_user_id);
    IF (v_item->>'tipo_cobranca_id') IS NOT NULL AND (v_item->>'tipo_cobranca_id') != '' THEN
      UPDATE public.financeiro_cobrancas_geradas SET status = 'pago', lancamento_id = (SELECT id FROM public.financeiro_lancamentos WHERE sessao_id = p_sessao_id AND tipo_cobranca_id = (v_item->>'tipo_cobranca_id')::uuid ORDER BY created_at DESC LIMIT 1), updated_at = now() WHERE socio_cpf = p_socio_cpf AND tipo_cobranca_id = (v_item->>'tipo_cobranca_id')::uuid AND status = 'pendente';
    END IF;
  END LOOP;
  FOR v_dae IN SELECT * FROM jsonb_array_elements(v_daes_array) LOOP
    INSERT INTO public.financeiro_dae (socio_cpf, sessao_id, tipo_boleto, competencia_ano, competencia_mes, valor, forma_pagamento, registrado_por, data_recebimento, grupo_id)
    VALUES (p_socio_cpf, p_sessao_id, (v_dae->>'tipo_boleto'), (v_dae->>'competencia_ano')::integer, (v_dae->>'competencia_mes')::integer, (v_dae->>'valor')::numeric, p_forma_pagamento, v_user_id, p_data_pagamento, CASE WHEN (v_dae->>'tipo_boleto') = 'unitario' THEN NULL ELSE v_grupo_id END);
  END LOOP;
END; $function$;

-- 7. VIEWS
CREATE OR REPLACE VIEW public.v_requerimentos_busca AS
 SELECT r.id, r.cod_req, r.data_assinatura, r.cpf, r.ano_referencia, r.status_mte, r.data_envio, r.num_req_mte, r.created_at, r.updated_at, r.beneficio_recebido, s.nome AS socio_nome, s.nit AS socio_nit
 FROM (requerimentos r LEFT JOIN socios s ON ((r.cpf = s.cpf)));

CREATE OR REPLACE VIEW public.v_situacao_financeira_socio AS
 WITH base AS (
   SELECT s.cpf, s.nome, s.situacao AS situacao_associativa, COALESCE(cfg.regime, pf.regime_padrao) AS regime, COALESCE(cfg.isento, false) AS isento, COALESCE(cfg.liberado_pelo_presidente, false) AS liberado_presidente, array_agg(fl.competencia_ano ORDER BY fl.competencia_ano) FILTER (WHERE ((fl.tipo = 'anuidade'::text) AND (fl.status = 'pago'::text))) AS anuidades_pagas, max(fl.data_pagamento) AS ultimo_pagamento, array_agg(fl.competencia_mes ORDER BY fl.competencia_mes) FILTER (WHERE ((fl.tipo = 'mensalidade'::text) AND (fl.status = 'pago'::text) AND (fl.competencia_ano = (EXTRACT(year FROM CURRENT_DATE))::integer))) AS meses_pagos_atual
   FROM (((public.socios s LEFT JOIN ( SELECT parametros_financeiros.regime_padrao FROM public.parametros_financeiros LIMIT 1) pf ON (true)) LEFT JOIN public.financeiro_config_socio cfg ON ((cfg.cpf = s.cpf))) LEFT JOIN public.financeiro_lancamentos fl ON ((fl.socio_cpf = s.cpf)))
   GROUP BY s.cpf, s.nome, s.situacao, cfg.regime, pf.regime_padrao, cfg.isento, cfg.liberado_pelo_presidente
 )
 SELECT cpf, nome, situacao_associativa, regime, isento, liberado_presidente, anuidades_pagas, ultimo_pagamento, public.get_socio_financial_status(cpf, regime, isento, liberado_presidente) AS situacao_geral, meses_pagos_atual
 FROM base;

CREATE OR REPLACE VIEW public.v_debitos_socio AS
 WITH anos AS (SELECT generate_series((SELECT COALESCE(min(ano_base_cobranca), 2024) FROM public.parametros_financeiros), (EXTRACT(year FROM CURRENT_DATE))::integer) AS ano)
 SELECT s.cpf, s.nome, a.ano, (NOT (EXISTS (SELECT 1 FROM public.financeiro_lancamentos fl WHERE ((fl.socio_cpf = s.cpf) AND (fl.tipo = 'anuidade'::text) AND (fl.competencia_ano = a.ano) AND (fl.status = 'pago'::text))))) AS anuidade_pendente, COALESCE(cfg.isento, false) AS isento, COALESCE(cfg.liberado_pelo_presidente, false) AS liberado
 FROM (((public.socios s CROSS JOIN anos a) LEFT JOIN ( SELECT regime_padrao FROM public.parametros_financeiros LIMIT 1) pf ON (true)) LEFT JOIN public.financeiro_config_socio cfg ON ((cfg.cpf = s.cpf)))
 WHERE ((COALESCE(cfg.regime, pf.regime_padrao) = 'anuidade'::text) AND (a.ano >= (SELECT COALESCE(min(ano_base_cobranca), 2024) FROM public.parametros_financeiros)));

-- 8. TRIGGERS
CREATE TRIGGER trg_socios_upd BEFORE UPDATE ON public.socios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trigger_generate_codigo_localidade BEFORE INSERT ON public.localidades FOR EACH ROW EXECUTE FUNCTION public.generate_next_codigo_localidade();
CREATE TRIGGER trigger_auto_generate_cod_req BEFORE INSERT ON public.requerimentos FOR EACH ROW EXECUTE FUNCTION public.auto_generate_cod_req();
CREATE TRIGGER tr_audit_tipos_cobranca AFTER INSERT OR UPDATE OR DELETE ON public.tipos_cobranca FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();
CREATE TRIGGER tr_check_member_limit BEFORE INSERT ON public.socios FOR EACH ROW EXECUTE FUNCTION public.check_member_limit();
CREATE TRIGGER tr_audit_parametros_financeiros AFTER INSERT OR UPDATE OR DELETE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();
CREATE TRIGGER trg_parametros_financeiros_upd BEFORE UPDATE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tipos_cobranca_upd BEFORE UPDATE ON public.tipos_cobranca FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fin_lancamentos_upd BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fin_dae_upd BEFORE UPDATE ON public.financeiro_dae FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fin_config_socio_upd BEFORE UPDATE ON public.financeiro_config_socio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cobrancas_geradas_upd BEFORE UPDATE ON public.financeiro_cobrancas_geradas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. RLS POLICIES
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.socios FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.entidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.entidade FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow user to read own User data" ON public."User" FOR SELECT TO authenticated USING (((SELECT auth.uid()) = id) OR (((SELECT (auth.jwt() -> 'app_metadata'::text)) ->> 'role'::text) = 'admin'::text));
CREATE POLICY "Service role can manage users" ON public."User" FOR ALL TO service_role USING (true);
CREATE POLICY "Allow user to update own data" ON public."User" FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.templates FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.parametros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.parametros FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.localidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.localidades FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.requerimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.requerimentos FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.reap ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.reap FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.parametros_financeiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.parametros_financeiros FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.tipos_cobranca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.tipos_cobranca FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.financeiro_lancamentos FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.financeiro_dae ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.financeiro_dae FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.financeiro_cobrancas_geradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.financeiro_cobrancas_geradas FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.financeiro_config_socio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON public.financeiro_config_socio FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

ALTER TABLE public.configuracao_entidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir leitura para todos autenticados" ON public.configuracao_entidade FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir gestão para usuários autenticados" ON public.configuracao_entidade FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.audit_log_financeiro ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver auditoria" ON public.audit_log_financeiro FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin'));

ALTER TABLE public.foto_upload_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable insert for authenticated" ON public.foto_upload_tokens FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable select by token" ON public.foto_upload_tokens FOR SELECT TO public USING (true);

-- 10. REALTIME
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.foto_upload_tokens;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Erro ao configurar Realtime: %', SQLERRM;
END $$;

-- 11. STORAGE BUCKETS
-- Nota: Isso requer permissões de admin. Em Supabase, buckets são gerenciados via storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('fotos', 'fotos', true, null, null),
  ('documentos', 'documentos', true, 5242880, null),
  ('branding', 'branding', true, null, null)
ON CONFLICT (id) DO NOTHING;

-- STORAGE POLICIES
DO $$ BEGIN
  CREATE POLICY "Acesso total para usuários autenticados_documentos" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'documentos'::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public Access" ON storage.objects FOR SELECT TO public USING (bucket_id = 'fotos'::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Acesso total para usuários autenticados_fotos" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'fotos'::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Acesso público para visualização de branding" ON storage.objects FOR SELECT TO public USING (bucket_id = 'branding'::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Acesso total para usuários autenticados no branding" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'branding'::text) WITH CHECK (bucket_id = 'branding'::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 12. AUTH TRIGGERS (Sync public.User)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  INSERT INTO public."User" (id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data->>'role', 'user'))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = COALESCE(EXCLUDED.role, public."User".role);
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.handle_update_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  UPDATE public."User" SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.handle_delete_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  DELETE FROM public."User" WHERE id = OLD.id;
  RETURN OLD;
END; $function$;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_updated') THEN
    CREATE TRIGGER on_auth_user_updated AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_update_user();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_deleted') THEN
    CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Erro ao configurar Auth Triggers: %', SQLERRM;
END $$;