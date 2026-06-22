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
