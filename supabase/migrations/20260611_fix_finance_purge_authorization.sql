-- Replace legacy app_metadata.role = 'admin' gate with the current
-- tenant_users authorization model: owner or presidente.

CREATE OR REPLACE FUNCTION public.purge_cancelled_bulk_v1(p_older_than_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_count int;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.is_active = true
          AND (
            tu.tenant_role = 'owner'
            OR tu.operator_type = 'presidente'
          )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Requer privilegios de administrador.';
    END IF;

    INSERT INTO public.audit_log_financeiro (
        table_name, record_id, operation, old_data, changed_by
    )
    SELECT
        'financeiro_lancamentos', l.id, 'PURGE_BULK', to_jsonb(l.*), auth.uid()
    FROM public.financeiro_lancamentos l
    WHERE l.status = 'cancelado'
      AND l.cancelado_em < (now() - (p_older_than_days || ' days')::interval);

    UPDATE public.financeiro_cobrancas_geradas
    SET lancamento_id = NULL
    WHERE lancamento_id IN (
        SELECT l.id FROM public.financeiro_lancamentos l
        WHERE l.status = 'cancelado'
          AND l.cancelado_em < (now() - (p_older_than_days || ' days')::interval)
    );

    WITH deleted AS (
        DELETE FROM public.financeiro_lancamentos
        WHERE status = 'cancelado'
          AND cancelado_em < (now() - (p_older_than_days || ' days')::interval)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM deleted;

    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_payment_v1(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_old_data jsonb;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.is_active = true
          AND (
            tu.tenant_role = 'owner'
            OR tu.operator_type = 'presidente'
          )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: Requer privilégios de administrador.';
    END IF;

    SELECT to_jsonb(l.*) INTO v_old_data
    FROM public.financeiro_lancamentos l
    WHERE l.id = p_id;

    IF v_old_data IS NULL THEN
        RAISE EXCEPTION 'Lançamento não encontrado.';
    END IF;

    IF (v_old_data->>'status') != 'cancelado' THEN
        RAISE EXCEPTION 'Apenas lançamentos com status "cancelado" podem ser excluídos permanentemente.';
    END IF;

    UPDATE public.financeiro_cobrancas_geradas
    SET lancamento_id = NULL
    WHERE lancamento_id = p_id;

    INSERT INTO public.audit_log_financeiro (
        table_name, record_id, operation, old_data, changed_by
    ) VALUES (
        'financeiro_lancamentos', p_id, 'PURGE', v_old_data, auth.uid()
    );

    DELETE FROM public.financeiro_lancamentos WHERE id = p_id;
END;
$$;
