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
