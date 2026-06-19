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
    v_admission_date date;
    v_first_required_month int := 1;
BEGIN
    IF p_isento OR p_liberado THEN
        RETURN 'ISENTO';
    END IF;

    SELECT s.data_de_admissao
      INTO v_admission_date
      FROM public.socios s
     WHERE s.cpf = p_cpf;

    IF v_admission_date IS NOT NULL
       AND EXTRACT(year FROM v_admission_date)::int = v_current_year THEN
        v_first_required_month := EXTRACT(month FROM v_admission_date)::int;
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
            FROM generate_series(v_first_required_month, v_current_month) m
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

CREATE OR REPLACE VIEW public.v_situacao_financeira_socio
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    s.cpf,
    s.nome,
    s.unit_id,
    s.data_de_admissao,
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
    s.data_de_admissao,
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
  meses_pagos_atual,
  data_de_admissao
FROM base;

COMMIT;
