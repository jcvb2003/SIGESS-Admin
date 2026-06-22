-- BEGIN D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_extension_license_hardening_combined.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.update_extension_license(
  p_key text,
  p_unit_id uuid DEFAULT NULL::uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_target_unit_id uuid;
  v_unit_count integer;
BEGIN
  v_tenant_id := public.get_caller_tenant_id();

  IF p_unit_id IS NOT NULL THEN
    v_target_unit_id := p_unit_id;
  ELSE
    SELECT count(*), min(unit_id)
    INTO v_unit_count, v_target_unit_id
    FROM public.configuracao_entidade
    WHERE tenant_id = v_tenant_id;

    IF v_unit_count = 0 THEN
      RAISE EXCEPTION 'Configuração da entidade não encontrada para o seu tenant.';
    END IF;

    IF v_unit_count <> 1 THEN
      RAISE EXCEPTION 'p_unit_id obrigatório: tabela configuracao_entidade está em modo multi-polo';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.configuracao_entidade c
    WHERE c.tenant_id = v_tenant_id
      AND c.unit_id = v_target_unit_id
      AND (
        public.is_tenant_owner(v_tenant_id)
        OR EXISTS (
          SELECT 1
          FROM public.user_unit_memberships m
          WHERE m.user_id = auth.uid()
            AND m.tenant_id = v_tenant_id
            AND m.unit_id = v_target_unit_id
            AND m.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: unit fora do seu escopo.';
  END IF;

  UPDATE public.configuracao_entidade
  SET extensao_license_key = NULLIF(btrim(p_key), ''),
      updated_at = now()
  WHERE tenant_id = v_tenant_id
    AND unit_id = v_target_unit_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_extension_license(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_extension_license(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_extension_license(text, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.update_extension_license(text, uuid) TO authenticated;

COMMIT;
-- END D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_extension_license_hardening_combined.sql

-- BEGIN D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_finance_bulk_purge_hardening_combined.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.purge_cancelled_bulk_v1(
  p_older_than_days integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_count int;
    v_tenant_id uuid;
BEGIN
    v_tenant_id := public.get_caller_tenant_id();

    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.tenant_id = v_tenant_id
          AND tu.is_active = true
          AND (
            tu.tenant_role = 'owner'
            OR tu.operator_type = 'presidente'
          )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Requer privilégios de administrador.';
    END IF;

    INSERT INTO public.audit_log_financeiro (
        table_name,
        record_id,
        operation,
        old_data,
        changed_by,
        tenant_id,
        unit_id
    )
    SELECT
        'financeiro_lancamentos',
        l.id,
        'PURGE_BULK',
        to_jsonb(l.*),
        auth.uid(),
        s.tenant_id,
        s.unit_id
    FROM public.financeiro_lancamentos l
    JOIN public.socios s
      ON s.cpf = l.socio_cpf
    WHERE s.tenant_id = v_tenant_id
      AND l.status = 'cancelado'
      AND l.cancelado_em < (now() - (p_older_than_days || ' days')::interval);

    UPDATE public.financeiro_cobrancas_geradas c
    SET lancamento_id = NULL
    WHERE c.lancamento_id IN (
        SELECT l.id
        FROM public.financeiro_lancamentos l
        JOIN public.socios s
          ON s.cpf = l.socio_cpf
        WHERE s.tenant_id = v_tenant_id
          AND l.status = 'cancelado'
          AND l.cancelado_em < (now() - (p_older_than_days || ' days')::interval)
    );

    WITH deleted AS (
        DELETE FROM public.financeiro_lancamentos l
        USING public.socios s
        WHERE s.cpf = l.socio_cpf
          AND s.tenant_id = v_tenant_id
          AND l.status = 'cancelado'
          AND l.cancelado_em < (now() - (p_older_than_days || ' days')::interval)
        RETURNING l.id
    )
    SELECT count(*) INTO v_count FROM deleted;

    RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_cancelled_bulk_v1(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_cancelled_bulk_v1(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_cancelled_bulk_v1(integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.purge_cancelled_bulk_v1(integer) TO authenticated;

COMMIT;
-- END D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_finance_bulk_purge_hardening_combined.sql

-- BEGIN D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_finance_rpc_hardening_combined.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_payment_v1(
  p_id uuid,
  p_obs text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_socio_cpf text;
    v_lancamento_tipo text;
    v_target_tenant_id uuid;
    v_target_unit_id uuid;
    v_caller_tenant_id uuid;
BEGIN
    v_caller_tenant_id := public.get_caller_tenant_id();

    SELECT
        l.socio_cpf,
        l.tipo,
        s.tenant_id,
        s.unit_id
    INTO
        v_socio_cpf,
        v_lancamento_tipo,
        v_target_tenant_id,
        v_target_unit_id
    FROM public.financeiro_lancamentos l
    JOIN public.socios s
      ON s.cpf = l.socio_cpf
    WHERE l.id = p_id
      AND l.status != 'cancelado'
    LIMIT 1;

    IF v_socio_cpf IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado ou já cancelado.';
    END IF;

    IF v_target_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
        RAISE EXCEPTION 'Acesso negado: lançamento fora do seu tenant.';
    END IF;

    IF NOT (
        public.is_tenant_owner(v_target_tenant_id)
        OR EXISTS (
            SELECT 1
            FROM public.tenant_users tu
            JOIN public.user_unit_memberships m
              ON m.user_id = tu.user_id
             AND m.tenant_id = tu.tenant_id
             AND m.unit_id = v_target_unit_id
             AND m.is_active = true
            WHERE tu.user_id = auth.uid()
              AND tu.tenant_id = v_target_tenant_id
              AND tu.is_active = true
              AND tu.tenant_role = 'member'
              AND tu.operator_type = 'presidente'
        )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: requer privilégios administrativos da unidade.';
    END IF;

    UPDATE public.financeiro_lancamentos
    SET
        status = 'cancelado',
        cancelado_em = now(),
        cancelado_por = auth.uid(),
        cancelamento_obs = p_obs,
        updated_at = now()
    WHERE id = p_id;

    UPDATE public.financeiro_cobrancas_geradas
    SET
        status = 'pendente',
        lancamento_id = NULL,
        updated_at = now()
    WHERE lancamento_id = p_id;

    INSERT INTO public.audit_log_financeiro (
        table_name,
        record_id,
        operation,
        new_data,
        changed_by,
        tenant_id,
        unit_id
    )
    VALUES (
        'financeiro_lancamentos',
        p_id,
        'CANCEL_PAYMENT',
        jsonb_build_object('obs', p_obs, 'socio', v_socio_cpf, 'tipo', v_lancamento_tipo),
        auth.uid(),
        v_target_tenant_id,
        v_target_unit_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_dae_group(
  p_grupo_id uuid,
  p_new_year integer,
  p_items jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_novo_grupo_id uuid := gen_random_uuid();
  v_membro_base record;
  v_item jsonb;
  v_target_tenant_id uuid;
  v_target_unit_id uuid;
  v_caller_tenant_id uuid;
BEGIN
  v_caller_tenant_id := public.get_caller_tenant_id();

  SELECT
    d.socio_cpf,
    d.sessao_id,
    d.tipo_boleto,
    d.forma_pagamento,
    d.data_recebimento,
    s.tenant_id,
    s.unit_id
  INTO v_membro_base
  FROM public.financeiro_dae d
  JOIN public.socios s
    ON s.cpf = d.socio_cpf
  WHERE d.grupo_id = p_grupo_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo não encontrado: %', p_grupo_id;
  END IF;

  v_target_tenant_id := v_membro_base.tenant_id;
  v_target_unit_id := v_membro_base.unit_id;

  IF v_target_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
    RAISE EXCEPTION 'Acesso negado: grupo fora do seu tenant.';
  END IF;

  IF NOT (
    public.is_tenant_owner(v_target_tenant_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      JOIN public.user_unit_memberships m
        ON m.user_id = tu.user_id
       AND m.tenant_id = tu.tenant_id
       AND m.unit_id = v_target_unit_id
       AND m.is_active = true
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = v_target_tenant_id
        AND tu.is_active = true
        AND tu.tenant_role = 'member'
        AND tu.operator_type = 'presidente'
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer privilégios administrativos da unidade.';
  END IF;

  UPDATE public.financeiro_dae
  SET status = 'cancelado',
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      cancelamento_obs = 'Correção: Grupo re-emitido devido a edição de valores/competência'
  WHERE grupo_id = p_grupo_id
    AND status != 'cancelado';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.financeiro_dae (
      socio_cpf,
      sessao_id,
      tipo_boleto,
      competencia_ano,
      competencia_mes,
      valor,
      forma_pagamento,
      boleto_pago,
      data_pagamento_boleto,
      status,
      registrado_por,
      data_recebimento,
      grupo_id
    )
    VALUES (
      v_membro_base.socio_cpf,
      v_membro_base.sessao_id,
      v_membro_base.tipo_boleto,
      p_new_year,
      (v_item->>'mes')::int,
      (v_item->>'valor')::numeric,
      v_membro_base.forma_pagamento,
      COALESCE((
        SELECT boleto_pago
        FROM public.financeiro_dae
        WHERE grupo_id = p_grupo_id
          AND competencia_mes = (v_item->>'mes')::int
        LIMIT 1
      ), false),
      (
        SELECT data_pagamento_boleto
        FROM public.financeiro_dae
        WHERE grupo_id = p_grupo_id
          AND competencia_mes = (v_item->>'mes')::int
        LIMIT 1
      ),
      'pago',
      auth.uid(),
      v_membro_base.data_recebimento,
      v_novo_grupo_id
    );
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.cancel_payment_v1(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_payment_v1(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_payment_v1(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.cancel_payment_v1(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_dae_group(uuid, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_dae_group(uuid, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_dae_group(uuid, integer, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.update_dae_group(uuid, integer, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.purge_payment_v1(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_payment_v1(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_payment_v1(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.purge_payment_v1(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_finance_audit_log_v1(uuid, uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_finance_audit_log_v1(uuid, uuid, text, text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_finance_audit_log_v1(uuid, uuid, text, text, integer, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_finance_audit_log_v1(uuid, uuid, text, text, integer, integer) TO authenticated;

COMMIT;
-- END D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_finance_rpc_hardening_combined.sql

-- BEGIN D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_finance_view_and_counts_hardening_combined.sql
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
-- END D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_finance_view_and_counts_hardening_combined.sql

-- BEGIN D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_parametros_portarias_rls_hardening_combined.sql
BEGIN;

DROP POLICY IF EXISTS parametros_financeiros_select ON public.parametros_financeiros;
CREATE POLICY parametros_financeiros_select
ON public.parametros_financeiros
FOR SELECT
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS parametros_financeiros_insert ON public.parametros_financeiros;
CREATE POLICY parametros_financeiros_insert
ON public.parametros_financeiros
FOR INSERT
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS parametros_financeiros_update ON public.parametros_financeiros;
CREATE POLICY parametros_financeiros_update
ON public.parametros_financeiros
FOR UPDATE
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
)
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = parametros_financeiros.tenant_id
      AND m.unit_id = parametros_financeiros.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_select ON public.portarias;
CREATE POLICY portarias_select
ON public.portarias
FOR SELECT
TO authenticated
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_insert ON public.portarias;
CREATE POLICY portarias_insert
ON public.portarias
FOR INSERT
TO authenticated
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_update ON public.portarias;
CREATE POLICY portarias_update
ON public.portarias
FOR UPDATE
TO authenticated
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
)
WITH CHECK (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

DROP POLICY IF EXISTS portarias_delete ON public.portarias;
CREATE POLICY portarias_delete
ON public.portarias
FOR DELETE
TO authenticated
USING (
  is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.user_unit_memberships m
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = portarias.tenant_id
      AND m.unit_id = portarias.unit_id
      AND m.is_active = true
  )
);

COMMIT;
-- END D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_parametros_portarias_rls_hardening_combined.sql

-- BEGIN D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_photo_and_import_rpcs_hardening_combined.sql
BEGIN;

REVOKE EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.confirmar_upload_foto(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.process_data_import(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_data_import(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_data_import(text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_data_import(text, jsonb) TO service_role;

COMMIT;
-- END D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_photo_and_import_rpcs_hardening_combined.sql

-- BEGIN D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_reap_rpcs_hardening_combined.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.reap_batch_upsert_anual_v2(p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  entry jsonb;
  v_tenant_id uuid := public.get_caller_tenant_id();
  v_cpf text;
  v_anual jsonb;
  v_ano text;
  v_ano_data jsonb;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_cpf := entry->>'cpf';
    v_anual := entry->'anual';

    IF v_cpf IS NULL OR btrim(v_cpf) = '' THEN
      RAISE EXCEPTION 'CPF obrigatorio no lote REAP anual';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.socios s
      WHERE s.cpf = v_cpf
        AND s.tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION 'CPF % nao pertence ao tenant autenticado', v_cpf;
    END IF;

    INSERT INTO public.reap (cpf, anual)
    VALUES (v_cpf, v_anual)
    ON CONFLICT (cpf) DO NOTHING;

    FOR v_ano, v_ano_data IN SELECT * FROM jsonb_each(v_anual)
    LOOP
      UPDATE public.reap
      SET
        anual = anual || jsonb_build_object(
          v_ano,
          COALESCE(anual -> v_ano, '{"enviado": false, "tem_problema": false, "data_envio": null, "obs": null}'::jsonb) || v_ano_data
        ),
        updated_at = now()
      WHERE cpf = v_cpf;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reap_batch_upsert_simplificado(p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  entry jsonb;
  v_tenant_id uuid := public.get_caller_tenant_id();
  v_cpf text;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_cpf := entry->>'cpf';

    IF v_cpf IS NULL OR btrim(v_cpf) = '' THEN
      RAISE EXCEPTION 'CPF obrigatorio no lote REAP simplificado';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.socios s
      WHERE s.cpf = v_cpf
        AND s.tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION 'CPF % nao pertence ao tenant autenticado', v_cpf;
    END IF;

    INSERT INTO public.reap (cpf, simplificado, updated_at)
    VALUES (
      v_cpf,
      entry->'simplificado',
      now()
    )
    ON CONFLICT (cpf) DO UPDATE
    SET
      simplificado = public.reap.simplificado || (entry->'simplificado'),
      updated_at = now();
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reap_batch_upsert_simplificado_v2(p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  entry jsonb;
  v_tenant_id uuid := public.get_caller_tenant_id();
  v_cpf text;
  v_simplificado jsonb;
  v_ano text;
  v_ano_data jsonb;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_cpf := entry->>'cpf';
    v_simplificado := entry->'simplificado';

    IF v_cpf IS NULL OR btrim(v_cpf) = '' THEN
      RAISE EXCEPTION 'CPF obrigatorio no lote REAP simplificado';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.socios s
      WHERE s.cpf = v_cpf
        AND s.tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION 'CPF % nao pertence ao tenant autenticado', v_cpf;
    END IF;

    INSERT INTO public.reap (cpf, simplificado)
    VALUES (v_cpf, v_simplificado)
    ON CONFLICT (cpf) DO NOTHING;

    FOR v_ano, v_ano_data IN SELECT * FROM jsonb_each(v_simplificado)
    LOOP
      UPDATE public.reap
      SET
        simplificado = simplificado || jsonb_build_object(
          v_ano,
          COALESCE(simplificado -> v_ano, '{"enviado": false, "tem_problema": false, "obs": null}'::jsonb) || v_ano_data
        ),
        updated_at = now()
      WHERE cpf = v_cpf;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reap_upsert_anual_ano(p_cpf text, p_ano text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid := public.get_caller_tenant_id();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = p_cpf
      AND s.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'CPF % nao pertence ao tenant autenticado', p_cpf;
  END IF;

  INSERT INTO public.reap (cpf, anual, updated_at)
  VALUES (p_cpf, jsonb_build_object(p_ano, p_data), now())
  ON CONFLICT (cpf) DO UPDATE
  SET
    anual = public.reap.anual || jsonb_build_object(
      p_ano,
      COALESCE(public.reap.anual -> p_ano,
        '{"enviado": false, "data_envio": null, "tem_problema": false, "obs": null}'::jsonb) || p_data
    ),
    updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.reap_upsert_full(p_cpf text, p_simplificado jsonb, p_anual jsonb, p_observacoes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid := public.get_caller_tenant_id();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = p_cpf
      AND s.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'CPF % nao pertence ao tenant autenticado', p_cpf;
  END IF;

  INSERT INTO public.reap (cpf, simplificado, anual, observacoes, updated_at)
  VALUES (p_cpf, p_simplificado, p_anual, p_observacoes, now())
  ON CONFLICT (cpf) DO UPDATE
  SET
    simplificado = EXCLUDED.simplificado,
    anual = EXCLUDED.anual,
    observacoes = EXCLUDED.observacoes,
    updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.reap_upsert_simplificado_ano(p_cpf text, p_ano text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_tenant_id uuid := public.get_caller_tenant_id();
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.socios s
    WHERE s.cpf = p_cpf
      AND s.tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'CPF % nao pertence ao tenant autenticado', p_cpf;
  END IF;

  INSERT INTO public.reap (cpf, simplificado, updated_at)
  VALUES (p_cpf, jsonb_build_object(p_ano, p_data), now())
  ON CONFLICT (cpf) DO UPDATE
  SET
    simplificado = public.reap.simplificado || jsonb_build_object(
      p_ano,
      COALESCE(public.reap.simplificado -> p_ano,
        '{"enviado": false, "tem_problema": false, "obs": null}'::jsonb) || p_data
    ),
    updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.reap_batch_upsert_anual_v2(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_batch_upsert_anual_v2(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.reap_batch_upsert_anual_v2(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reap_batch_upsert_anual_v2(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.reap_batch_upsert_simplificado(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_batch_upsert_simplificado(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.reap_batch_upsert_simplificado(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reap_batch_upsert_simplificado(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.reap_batch_upsert_simplificado_v2(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_batch_upsert_simplificado_v2(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.reap_batch_upsert_simplificado_v2(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reap_batch_upsert_simplificado_v2(jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.reap_upsert_anual_ano(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_upsert_anual_ano(text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.reap_upsert_anual_ano(text, text, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reap_upsert_anual_ano(text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.reap_upsert_full(text, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_upsert_full(text, jsonb, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.reap_upsert_full(text, jsonb, jsonb, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reap_upsert_full(text, jsonb, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reap_upsert_simplificado_ano(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reap_upsert_simplificado_ano(text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.reap_upsert_simplificado_ano(text, text, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.reap_upsert_simplificado_ano(text, text, jsonb) TO authenticated;

COMMIT;
-- END D:\Projetos Dev\REPOSITORIOS\SIGESS\Admin\supabase\migrations\_propagation\20260617_reap_rpcs_hardening_combined.sql

