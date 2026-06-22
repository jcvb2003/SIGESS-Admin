BEGIN;

CREATE OR REPLACE FUNCTION public.get_socio_financial_status(
  p_cpf text,
  p_regime text,
  p_isento boolean,
  p_liberado boolean
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_current_year int := EXTRACT(year FROM CURRENT_DATE);
    v_current_month int := EXTRACT(month FROM CURRENT_DATE);
BEGIN
    IF p_isento OR p_liberado THEN
        RETURN 'ISENTO';
    END IF;

    IF p_regime = 'anuidade' THEN
        IF EXISTS (
            SELECT 1
            FROM public.financeiro_lancamentos
            WHERE socio_cpf = p_cpf
              AND tipo = 'anuidade'
              AND competencia_ano = v_current_year
              AND status = 'pago'
        ) THEN
            RETURN 'EM_DIA';
        ELSE
            RETURN 'EM_ATRASO';
        END IF;
    ELSIF p_regime = 'mensalidade' THEN
        IF NOT EXISTS (
            SELECT 1
            FROM generate_series(1, v_current_month) m
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.financeiro_lancamentos
                WHERE socio_cpf = p_cpf
                  AND tipo = 'mensalidade'
                  AND competencia_ano = v_current_year
                  AND competencia_mes = m
                  AND status = 'pago'
            )
        ) THEN
            RETURN 'EM_DIA';
        ELSE
            RETURN 'EM_ATRASO';
        END IF;
    ELSE
        RETURN 'EM_ATRASO';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_finance_tab_counts(
  p_search_term text DEFAULT '',
  p_year integer DEFAULT NULL,
  p_ano_base integer DEFAULT 2024
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_year integer;
  v_required_years integer[];
  v_result jsonb;
  v_todos bigint;
  v_isentos bigint;
  v_liberados bigint;
  v_em_dia bigint;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  v_required_years := ARRAY(SELECT generate_series(p_ano_base, v_year));

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE isento = true),
    COUNT(*) FILTER (WHERE liberado_presidente = true),
    COUNT(*) FILTER (
      WHERE isento = false
        AND liberado_presidente = false
        AND anuidades_pagas @> v_required_years
    )
  INTO v_todos, v_isentos, v_liberados, v_em_dia
  FROM public.v_situacao_financeira_socio
  WHERE (
    p_search_term = ''
    OR nome ILIKE '%' || p_search_term || '%'
    OR cpf ILIKE '%' || p_search_term || '%'
  );

  v_result := jsonb_build_object(
    'todos', v_todos,
    'em-dia', v_em_dia,
    'inadimplentes', GREATEST(v_todos - COALESCE(v_em_dia, 0) - COALESCE(v_isentos, 0) - COALESCE(v_liberados, 0), 0),
    'liberados', COALESCE(v_liberados, 0),
    'isentos', COALESCE(v_isentos, 0)
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_finance_tab_counts(
  p_search_term text DEFAULT '',
  p_year integer DEFAULT NULL,
  p_ano_base integer DEFAULT 2024,
  p_unit_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_year integer;
  v_required_years integer[];
  v_result jsonb;
  v_todos bigint;
  v_isentos bigint;
  v_liberados bigint;
  v_em_dia bigint;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::integer);
  v_required_years := ARRAY(SELECT generate_series(p_ano_base, v_year));

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE isento = true),
    COUNT(*) FILTER (WHERE liberado_presidente = true),
    COUNT(*) FILTER (
      WHERE isento = false
        AND liberado_presidente = false
        AND anuidades_pagas @> v_required_years
    )
  INTO v_todos, v_isentos, v_liberados, v_em_dia
  FROM public.v_situacao_financeira_socio
  WHERE (
    p_search_term = ''
    OR nome ILIKE '%' || p_search_term || '%'
    OR cpf ILIKE '%' || p_search_term || '%'
  )
    AND (p_unit_id IS NULL OR unit_id = p_unit_id);

  v_result := jsonb_build_object(
    'todos', v_todos,
    'em-dia', v_em_dia,
    'inadimplentes', GREATEST(v_todos - COALESCE(v_em_dia, 0) - COALESCE(v_isentos, 0) - COALESCE(v_liberados, 0), 0),
    'liberados', COALESCE(v_liberados, 0),
    'isentos', COALESCE(v_isentos, 0)
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE VIEW public.v_situacao_financeira_socio
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    s.cpf,
    s.nome,
    s.unit_id,
    s.situacao AS situacao_associativa,
    COALESCE(cfg.regime, pf.regime_padrao) AS regime,
    COALESCE(cfg.isento, false) AS isento,
    COALESCE(cfg.liberado_pelo_presidente, false) AS liberado_presidente,
    array_agg(fl.competencia_ano ORDER BY fl.competencia_ano)
      FILTER (WHERE fl.tipo = 'anuidade' AND fl.status = 'pago') AS anuidades_pagas,
    max(fl.data_pagamento) AS ultimo_pagamento,
    array_agg(fl.competencia_mes ORDER BY fl.competencia_mes)
      FILTER (
        WHERE fl.tipo = 'mensalidade'
          AND fl.status = 'pago'
          AND fl.competencia_ano = EXTRACT(year FROM CURRENT_DATE)::integer
      ) AS meses_pagos_atual
  FROM public.socios s
  LEFT JOIN (
    SELECT parametros_financeiros.regime_padrao
    FROM public.parametros_financeiros
    LIMIT 1
  ) pf ON true
  LEFT JOIN public.financeiro_config_socio cfg
    ON cfg.cpf = s.cpf
  LEFT JOIN public.financeiro_lancamentos fl
    ON fl.socio_cpf = s.cpf
  GROUP BY
    s.cpf,
    s.nome,
    s.unit_id,
    s.situacao,
    cfg.regime,
    pf.regime_padrao,
    cfg.isento,
    cfg.liberado_pelo_presidente
)
SELECT
  cpf,
  nome,
  unit_id,
  situacao_associativa,
  regime,
  isento,
  liberado_presidente,
  anuidades_pagas,
  ultimo_pagamento,
  public.get_socio_financial_status(cpf, regime, isento, liberado_presidente) AS situacao_geral,
  meses_pagos_atual
FROM base;

REVOKE EXECUTE ON FUNCTION public.get_socio_financial_status(text, text, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_socio_financial_status(text, text, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_socio_financial_status(text, text, boolean, boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_socio_financial_status(text, text, boolean, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_tab_counts(text, integer, integer, uuid) TO authenticated;

COMMIT;
