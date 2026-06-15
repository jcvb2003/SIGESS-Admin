-- =============================================================================
-- 20260614_hardening_shared_rpcs.sql
-- Hardening de RPCs SECURITY DEFINER para ambiente shared_multi_single.
-- Problema central: funcoes sem fronteira de tenant_id vazam dados cross-tenant
-- quando chamadas em projetos com N tenants no mesmo banco.
-- Estrategia: derivar tenant_id do caller via helper (get_caller_tenant_id) e
-- adicionar filtro explicito em todas as queries de socios/cobrancas.
-- Tambem revoga EXECUTE de anon e PUBLIC em todas as funcoes afetadas.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: get_caller_tenant_id()
-- Deriva o tenant_id do usuario autenticado. Erros explicitamente em dois
-- casos: sem vinculo ativo (0) ou vinculo ambiguo (>1).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_caller_tenant_id()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id uuid;
  v_count     integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.tenant_users
  WHERE user_id = auth.uid() AND is_active = true;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'access denied: no active tenant membership';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'ambiguous context: expected 1 active tenant, found %', v_count;
  END IF;

  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_users
  WHERE user_id = auth.uid() AND is_active = true;

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_caller_tenant_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_caller_tenant_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. get_members_by_birth_month
-- Antes: lia socios sem nenhum filtro de tenant.
-- Agora: deriva tenant do caller e filtra socios por tenant_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_members_by_birth_month(
  p_month  integer,
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id                 uuid,
  nome               text,
  cpf                text,
  data_de_nascimento date,
  codigo_do_socio    text,
  total_count        bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_caller_tenant_id();

  RETURN QUERY
  WITH filtered AS (
    SELECT s.id, s.nome, s.cpf, s.data_de_nascimento, s.codigo_do_socio
    FROM public.socios s
    WHERE EXTRACT(month FROM s.data_de_nascimento) = p_month
      AND s.tenant_id = v_tenant_id
  ),
  total AS (SELECT count(*) AS count FROM filtered)
  SELECT f.*, t.count
  FROM filtered f, total t
  ORDER BY f.nome
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- service_role removido: grant anterior era heranca de schema, nao contrato intencional
REVOKE ALL ON FUNCTION public.get_members_by_birth_month(integer, integer, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_members_by_birth_month(integer, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. get_birthday_members
-- Antes: (p_unit_id IS NULL OR s.unit_id = p_unit_id) -- quando NULL, sem tenant scope.
-- Agora: tenant sempre derivado do caller; p_unit_id e escopo adicional dentro do tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_birthday_members(
  p_day     integer,
  p_month   integer,
  p_unit_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id                 uuid,
  nome               text,
  cpf                text,
  data_de_nascimento date
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_caller_tenant_id();

  RETURN QUERY
  SELECT s.id, s.nome, s.cpf, s.data_de_nascimento
  FROM public.socios s
  WHERE EXTRACT(DAY   FROM s.data_de_nascimento) = p_day
    AND EXTRACT(MONTH FROM s.data_de_nascimento) = p_month
    AND s.tenant_id = v_tenant_id
    AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
  ORDER BY s.nome ASC;
END;
$$;

-- service_role removido: grant anterior era heranca de schema, nao contrato intencional
REVOKE ALL ON FUNCTION public.get_birthday_members(integer, integer, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_birthday_members(integer, integer, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. register_payment_session
-- Antes: aceitava qualquer CPF sem validar pertencimento ao tenant do caller.
-- Agora: valida que p_socio_cpf pertence ao tenant do caller antes de qualquer DML.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_payment_session(
  p_socio_cpf        text,
  p_sessao_id        uuid,
  p_forma_pagamento  text,
  p_data_pagamento   date,
  p_itens            jsonb,
  p_daes             jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item       jsonb;
  v_dae        jsonb;
  v_daes_array jsonb := COALESCE(p_daes, '[]'::jsonb);
  v_user_id    uuid  := auth.uid();
  v_grupo_id   uuid  := NULL;
  v_tenant_id  uuid;
BEGIN
  v_tenant_id := public.get_caller_tenant_id();

  IF NOT EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.cpf = p_socio_cpf AND s.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'access denied: CPF % does not belong to your tenant', p_socio_cpf;
  END IF;

  IF jsonb_array_length(v_daes_array) > 0 THEN
    IF (v_daes_array->0->>'tipo_boleto') != 'unitario' THEN
      v_grupo_id := gen_random_uuid();
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    INSERT INTO public.financeiro_lancamentos (
      socio_cpf, sessao_id, tipo, valor, forma_pagamento,
      data_pagamento, competencia_ano, competencia_mes,
      tipo_cobranca_id, descricao, registrado_por
    ) VALUES (
      p_socio_cpf,
      p_sessao_id,
      (v_item->>'tipo'),
      (v_item->>'valor')::numeric,
      p_forma_pagamento,
      p_data_pagamento,
      (v_item->>'competencia_ano')::integer,
      (v_item->>'competencia_mes')::integer,
      CASE WHEN (v_item->>'tipo_cobranca_id') = '' THEN NULL
           ELSE (v_item->>'tipo_cobranca_id')::uuid END,
      (v_item->>'descricao'),
      v_user_id
    );

    IF (v_item->>'tipo_cobranca_id') IS NOT NULL AND (v_item->>'tipo_cobranca_id') != '' THEN
      UPDATE public.financeiro_cobrancas_geradas
      SET status       = 'pago',
          lancamento_id = (
            SELECT id FROM public.financeiro_lancamentos
            WHERE sessao_id      = p_sessao_id
              AND tipo_cobranca_id = (v_item->>'tipo_cobranca_id')::uuid
            ORDER BY created_at DESC LIMIT 1
          ),
          updated_at = now()
      WHERE socio_cpf       = p_socio_cpf
        AND tipo_cobranca_id = (v_item->>'tipo_cobranca_id')::uuid
        AND status           = 'pendente';
    END IF;
  END LOOP;

  FOR v_dae IN SELECT * FROM jsonb_array_elements(v_daes_array)
  LOOP
    INSERT INTO public.financeiro_dae (
      socio_cpf, sessao_id, tipo_boleto, competencia_ano,
      competencia_mes, valor, forma_pagamento, registrado_por,
      data_recebimento, grupo_id
    ) VALUES (
      p_socio_cpf,
      p_sessao_id,
      (v_dae->>'tipo_boleto'),
      (v_dae->>'competencia_ano')::integer,
      (v_dae->>'competencia_mes')::integer,
      (v_dae->>'valor')::numeric,
      p_forma_pagamento,
      v_user_id,
      p_data_pagamento,
      CASE WHEN (v_dae->>'tipo_boleto') = 'unitario' THEN NULL ELSE v_grupo_id END
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.register_payment_session(text, uuid, text, date, jsonb, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_payment_session(text, uuid, text, date, jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. update_member_regime
-- Antes: atualizava financeiro_historico_regime e financeiro_config_socio pelo
-- CPF sem validar tenant.
-- Agora: valida CPF no tenant do caller antes de qualquer UPDATE/INSERT.
-- Obs (Q2): financeiro_historico_regime e financeiro_config_socio nao tem
-- tenant_id -- a validacao via socios e suficiente (CPF e unique global).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_member_regime(
  p_cpf         text,
  p_novo_regime text,
  p_observacao  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_caller_tenant_id();

  IF NOT EXISTS (
    SELECT 1 FROM public.socios s
    WHERE s.cpf = p_cpf AND s.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'access denied: CPF % does not belong to your tenant', p_cpf;
  END IF;

  UPDATE public.financeiro_historico_regime
  SET vigente_ate = CURRENT_DATE
  WHERE socio_cpf = p_cpf AND vigente_ate IS NULL;

  INSERT INTO public.financeiro_historico_regime
    (socio_cpf, regime, vigente_desde, alterado_por, observacao)
  VALUES (p_cpf, p_novo_regime, CURRENT_DATE, v_user_id, p_observacao);

  INSERT INTO public.financeiro_config_socio (cpf, regime)
  VALUES (p_cpf, p_novo_regime)
  ON CONFLICT (cpf) DO UPDATE SET regime = p_novo_regime, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_regime(text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_member_regime(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. launch_bulk_contribution
-- Antes: sem tenant scope em socios (p_unit_id IS NULL = todos os tenants) e
-- sem validacao de tenant em tipos_cobranca.
-- Agora: tenant sempre derivado do caller; filtro em socios E em tipos_cobranca.
-- Obs (Q1): tipos_cobranca tem tenant_id -- o filtro e obrigatorio nos dois.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.launch_bulk_contribution(
  p_tipo_cobranca_id uuid,
  p_unit_id          uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_valor     numeric(10,2);
  v_count     integer := 0;
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.get_caller_tenant_id();

  SELECT valor_padrao INTO v_valor
  FROM public.tipos_cobranca
  WHERE id           = p_tipo_cobranca_id
    AND tenant_id    = v_tenant_id
    AND categoria    = 'contribuicao'
    AND obrigatoriedade = 'compulsoria'
    AND ativo        = true;

  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'Tipo de cobranca invalido, nao pertence ao seu tenant ou sem valor padrao definido';
  END IF;

  INSERT INTO public.financeiro_cobrancas_geradas (tipo_cobranca_id, socio_cpf, valor)
  SELECT p_tipo_cobranca_id, s.cpf, v_valor
  FROM public.socios s
  WHERE s.situacao   = 'ATIVO'
    AND s.tenant_id  = v_tenant_id
    AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.financeiro_cobrancas_geradas cg
      WHERE cg.tipo_cobranca_id = p_tipo_cobranca_id
        AND cg.socio_cpf        = s.cpf
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.launch_bulk_contribution(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.launch_bulk_contribution(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. get_payments_by_period_paginated
-- Antes: sem tenant scope quando p_unit_id IS NULL.
-- Agora: dual-path de derivacao de tenant:
--   - auth.uid() presente (authenticated): usa get_caller_tenant_id()
--   - auth.uid() ausente + p_unit_id presente (service_role): deriva de tenant_units
--   - nenhum dos dois: RAISE EXCEPTION
-- E a unica RPC do pacote que manteve service_role (contrato intencional pre-existente).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_payments_by_period_paginated(
  p_start_date date,
  p_end_date   date,
  p_limit      integer   DEFAULT 20,
  p_offset     integer   DEFAULT 0,
  p_order_by   text      DEFAULT 'data_pagamento',
  p_order_dir  text      DEFAULT 'DESC',
  p_unit_id    uuid      DEFAULT NULL,
  p_search     text      DEFAULT NULL,
  p_types      text[]    DEFAULT NULL
)
RETURNS TABLE(
  id               uuid,
  data_pagamento   date,
  tipo             text,
  tipo_exibicao    text,
  competencia_ano  integer,
  competencia_mes  integer,
  forma_pagamento  text,
  valor            numeric,
  created_at       timestamp with time zone,
  socio_nome       text,
  socio_cpf        text,
  total_count      bigint,
  total_amount     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Dual-path: authenticated sempre usa get_caller_tenant_id (seguro contra p_unit_id
  -- malicioso de outro tenant). service_role requer p_unit_id para derivar pelo banco.
  IF auth.uid() IS NOT NULL THEN
    v_tenant_id := public.get_caller_tenant_id();
  ELSIF p_unit_id IS NOT NULL THEN
    SELECT tu.tenant_id INTO v_tenant_id
    FROM public.tenant_units tu WHERE tu.id = p_unit_id;
    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'unit_id nao encontrado ou invalido';
    END IF;
  ELSE
    RAISE EXCEPTION 'contexto de tenant necessario: chamar como usuario autenticado ou fornecer unit_id';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      fl.id,
      fl.data_pagamento,
      fl.tipo,
      CASE
        WHEN fl.tipo IN ('contribuicao', 'cadastro_governamental') THEN
          COALESCE(
            NULLIF(BTRIM(fl.descricao), ''),
            NULLIF(BTRIM(tc.nome), ''),
            CASE fl.tipo
              WHEN 'contribuicao'          THEN 'Contribuicao'
              WHEN 'cadastro_governamental' THEN 'Cadastro governamental'
              ELSE fl.tipo
            END
          )
        ELSE
          CASE fl.tipo
            WHEN 'anuidade'      THEN 'Anuidade'
            WHEN 'mensalidade'   THEN 'Mensalidade'
            WHEN 'inicial'       THEN 'Taxa inicial'
            WHEN 'transferencia' THEN 'Transferencia'
            ELSE fl.tipo
          END
      END AS tipo_exibicao,
      fl.competencia_ano,
      fl.competencia_mes,
      fl.forma_pagamento,
      fl.valor,
      fl.created_at,
      s.nome AS socio_nome,
      s.cpf  AS socio_cpf
    FROM public.financeiro_lancamentos fl
    JOIN public.socios s
      ON s.cpf = fl.socio_cpf
    LEFT JOIN public.tipos_cobranca tc
      ON tc.id = fl.tipo_cobranca_id
    WHERE fl.status         = 'pago'
      AND fl.data_pagamento >= p_start_date
      AND fl.data_pagamento <= p_end_date
      AND s.tenant_id       = v_tenant_id
      AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
      AND (
        p_types IS NULL
        OR cardinality(p_types) = 0
        OR fl.tipo = ANY(p_types)
      )
      AND (
        p_search IS NULL
        OR BTRIM(p_search) = ''
        OR s.nome ILIKE '%' || p_search || '%'
        OR s.cpf  ILIKE '%' || p_search || '%'
        OR fl.tipo ILIKE '%' || p_search || '%'
        OR COALESCE(
             NULLIF(BTRIM(fl.descricao), ''),
             NULLIF(BTRIM(tc.nome), '')
           ) ILIKE '%' || p_search || '%'
      )
  ),
  stats AS (
    SELECT count(*) AS count, sum(base.valor) AS amount FROM base
  )
  SELECT
    b.id, b.data_pagamento, b.tipo, b.tipo_exibicao,
    b.competencia_ano, b.competencia_mes, b.forma_pagamento,
    b.valor, b.created_at, b.socio_nome, b.socio_cpf,
    st.count  AS total_count,
    st.amount AS total_amount
  FROM base b, stats st
  ORDER BY
    CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'ASC'  THEN b.data_pagamento END ASC,
    CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'DESC' THEN b.data_pagamento END DESC,
    CASE WHEN p_order_by = 'created_at'     AND p_order_dir = 'ASC'  THEN b.created_at     END ASC,
    CASE WHEN p_order_by = 'created_at'     AND p_order_dir = 'DESC' THEN b.created_at     END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- service_role e contrato intencional (unica RPC com dual-path para chamadas server-side).
-- Implementa derivacao de tenant via tenant_units quando p_unit_id informado.
-- Nenhum REVOKE necessario: anon/PUBLIC ja nao tinham grant antes desta migration.
REVOKE ALL ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. list_requirements_extended
-- Remove o overload inseguro de 7 parametros (sem unit_id, sem tenant scope).
-- Reescreve o overload de 8 parametros com tenant scope.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_requirements_extended(
  integer, text, text, text, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.list_requirements_extended(
  p_ano       integer,
  p_status    text    DEFAULT 'all',
  p_beneficio text    DEFAULT 'all',
  p_search    text    DEFAULT '',
  p_carencia  text    DEFAULT 'all',
  p_page      integer DEFAULT 1,
  p_page_size integer DEFAULT 10,
  p_unit_id   uuid    DEFAULT NULL
)
RETURNS TABLE(
  id                uuid,
  socio_id          uuid,
  cod_req           text,
  data_assinatura   date,
  cpf               text,
  ano_referencia    integer,
  status_mte        text,
  data_envio        date,
  num_req_mte       text,
  created_at        timestamp with time zone,
  updated_at        timestamp with time zone,
  beneficio_recebido boolean,
  socio_nome        text,
  socio_nit         text,
  socio_num_rgp     text,
  socio_emissao_rgp date,
  total_count       bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_offset       integer;
  v_defeso_start date;
  v_tenant_id    uuid;
BEGIN
  v_offset       := (p_page - 1) * p_page_size;
  v_defeso_start := make_date(p_ano, 11, 15);
  v_tenant_id    := public.get_caller_tenant_id();

  RETURN QUERY
  WITH filtered_data AS (
    SELECT
      r.id                                              AS requirement_id,
      s.id                                              AS member_id,
      r.cod_req,
      r.data_assinatura,
      s.cpf,
      COALESCE(r.ano_referencia, p_ano)                AS ano_referencia,
      COALESCE(r.status_mte, 'nao_assinado')           AS status_mte,
      r.data_envio,
      r.num_req_mte,
      r.created_at,
      r.updated_at,
      COALESCE(r.beneficio_recebido, false)            AS beneficio_recebido,
      s.nome                                            AS socio_nome,
      s.nit                                             AS socio_nit,
      s.num_rgp                                         AS socio_num_rgp,
      s.emissao_rgp                                     AS socio_emissao_rgp
    FROM public.socios s
    LEFT JOIN public.requerimentos r
      ON s.cpf = r.cpf AND r.ano_referencia = p_ano
    WHERE s.tenant_id = v_tenant_id
      AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
      AND (
        p_status = 'all'
        OR (CASE WHEN p_status = 'nao_assinado'
                 THEN r.id IS NULL
                 ELSE r.status_mte = p_status END)
      )
      AND (
        p_beneficio = 'all'
        OR (CASE WHEN p_beneficio = 'recebido'
                 THEN r.beneficio_recebido IS TRUE
                 ELSE r.beneficio_recebido IS FALSE OR r.beneficio_recebido IS NULL END)
      )
      AND (
        p_search = ''
        OR s.cpf        ILIKE '%' || p_search || '%'
        OR s.nome       ILIKE '%' || p_search || '%'
        OR r.cod_req    ILIKE '%' || p_search || '%'
      )
      AND (
        CASE
          WHEN p_carencia = 'com_carencia'
               THEN s.emissao_rgp <= v_defeso_start - INTERVAL '1 year'
          WHEN p_carencia = 'sem_carencia'
               THEN s.emissao_rgp >  v_defeso_start - INTERVAL '1 year'
                 OR s.emissao_rgp IS NULL
          ELSE TRUE
        END
      )
  )
  SELECT
    fd.requirement_id, fd.member_id, fd.cod_req, fd.data_assinatura,
    fd.cpf, fd.ano_referencia, fd.status_mte, fd.data_envio,
    fd.num_req_mte, fd.created_at, fd.updated_at, fd.beneficio_recebido,
    fd.socio_nome, fd.socio_nit, fd.socio_num_rgp, fd.socio_emissao_rgp,
    count(*) OVER() AS total_count
  FROM filtered_data fd
  ORDER BY fd.created_at DESC NULLS LAST, fd.socio_nome ASC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

-- service_role removido: grant anterior era heranca de schema, nao contrato intencional
REVOKE ALL ON FUNCTION public.list_requirements_extended(integer, text, text, text, text, integer, integer, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_requirements_extended(integer, text, text, text, text, integer, integer, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verificacao pos-aplicacao (executar manualmente apos aplicar a migration)
-- ---------------------------------------------------------------------------
-- 1. Confirmar que o overload de 7 parametros foi removido:
--    SELECT proname, pronargs FROM pg_proc WHERE proname = 'list_requirements_extended';
--    Esperado: 1 linha com pronargs = 8.
--
-- 2. Confirmar grants:
--    - Nenhuma funcao deve ter anon ou PUBLIC.
--    - Todas as funcoes: somente authenticated (exceto get_payments_by_period_paginated).
--    - get_payments_by_period_paginated: authenticated + service_role (unica excecao intencional).
--    SELECT routine_name, grantee FROM information_schema.role_routine_grants
--    WHERE routine_schema = 'public'
--      AND routine_name IN (
--        'get_caller_tenant_id','get_members_by_birth_month','get_birthday_members',
--        'register_payment_session','update_member_regime','launch_bulk_contribution',
--        'get_payments_by_period_paginated','list_requirements_extended'
--      )
--    ORDER BY routine_name, grantee;
