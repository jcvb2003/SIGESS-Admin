CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE FUNCTION public.auto_generate_cod_req() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (NEW.cod_req IS NULL) OR (NEW.cod_req = '') THEN
        NEW.cod_req := get_next_cod_req();
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.auto_membership_single_unit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_unit_id uuid;
  v_unit_count integer;
BEGIN
  SELECT count(*)
  INTO v_unit_count
  FROM public.tenant_units
  WHERE tenant_id = NEW.tenant_id
    AND is_active = true;

  IF v_unit_count <> 1 THEN
    RETURN NEW;
  END IF;

  -- owner governa o tenant inteiro e nunca recebe membership de unit.
  IF NEW.tenant_role = 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO v_unit_id
  FROM public.tenant_units
  WHERE tenant_id = NEW.tenant_id
    AND is_active = true
  LIMIT 1;

  INSERT INTO public.user_unit_memberships (user_id, tenant_id, unit_id, is_active)
  VALUES (NEW.user_id, NEW.tenant_id, v_unit_id, true)
  ON CONFLICT ON CONSTRAINT user_unit_memberships_user_tenant_unit_unique DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.cancel_payment_v1(p_id uuid, p_obs text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.check_member_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_limit integer;
  v_count integer;
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.tenant_units where id = new.unit_id;
  select max_socios into v_limit from public.tenants where id = v_tenant_id;
  v_limit := coalesce(v_limit, 0);
  select count(*) into v_count from public.socios
  where situacao != 'Excluído' and tenant_id = v_tenant_id;
  if v_count >= v_limit and (
    tg_op = 'INSERT' or
    (tg_op = 'UPDATE' and old.situacao = 'Excluído' and new.situacao != 'Excluído')
  ) then
    raise exception 'Limite de sócios atingido (%)', v_limit;
  end if;
  return new;
end;
$$;

CREATE FUNCTION public.chk_auxiliar_single_membership() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = NEW.user_id
      AND tenant_id = NEW.tenant_id
      AND tenant_role = 'member'
      AND operator_type = 'auxiliar'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM user_unit_memberships
      WHERE user_id = NEW.user_id
        AND tenant_id = NEW.tenant_id
        AND is_active = true
        AND id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'auxiliar cannot have more than one active membership';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.chk_no_owner_membership() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = NEW.user_id
      AND tenant_id = NEW.tenant_id
      AND tenant_role = 'owner'
  ) THEN
    RAISE EXCEPTION 'owner cannot have a unit membership';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.chk_no_role_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (OLD.tenant_role = 'owner' AND NEW.tenant_role <> 'owner') OR
     (OLD.tenant_role <> 'owner' AND NEW.tenant_role = 'owner') THEN
    RAISE EXCEPTION 'tenant_role transition between owner and member is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.confirmar_upload_foto(p_token uuid, p_base64 text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.foto_upload_tokens
  SET 
    foto_base64 = p_base64,
    used = true
  WHERE token = p_token
    AND used = false
    AND expires_at > now();

  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.fn_tenant_units_min_one() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_tenant_id uuid;
  v_remaining integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT OLD.is_active THEN
      RETURN OLD;
    END IF;
    v_tenant_id := OLD.tenant_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.is_active = true AND NEW.is_active = false) THEN
      RETURN NEW;
    END IF;
    v_tenant_id := OLD.tenant_id;
  END IF;

  SELECT count(*) INTO v_remaining
  FROM public.tenant_units
  WHERE tenant_id = v_tenant_id
    AND is_active = true
    AND id <> OLD.id;

  IF v_remaining = 0 THEN
    RAISE EXCEPTION
      'tenant_id % must have at least one active unit', v_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE FUNCTION public.generate_next_codigo_localidade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  max_code_val integer;
  next_code text;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo_localidade, '\\D', '', 'g'), '')::integer), 0) INTO max_code_val FROM public.localidades;
  next_code := LPAD((max_code_val + 1)::text, 3, '0');
  IF (NEW.codigo_localidade IS NULL) OR (NEW.codigo_localidade = '') THEN
    NEW.codigo_localidade := next_code;
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.get_birthday_members(p_day integer, p_month integer, p_unit_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, nome text, cpf text, data_de_nascimento date)
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

CREATE FUNCTION public.get_caller_tenant_id() RETURNS uuid
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

CREATE FUNCTION public.get_configuracao_recebimento_publica(p_tenant_id uuid) RETURNS TABLE(id uuid, tenant_id uuid, provider text, ambiente text, dia_vencimento integer, forma_padrao text, envio_automatico boolean, has_api_key boolean, has_webhook_token boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    cr.id,
    cr.tenant_id,
    cr.provider,
    cr.ambiente,
    cr.dia_vencimento,
    cr.forma_padrao,
    cr.envio_automatico,
    (cr.api_key IS NOT NULL)       AS has_api_key,
    (cr.webhook_token IS NOT NULL) AS has_webhook_token,
    cr.created_at,
    cr.updated_at
  FROM public.configuracao_recebimento cr
  WHERE cr.tenant_id = p_tenant_id
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = p_tenant_id
        AND tu.is_active = true
    );
$$;

CREATE FUNCTION public.get_external_charges_counts(p_tenant_id uuid, p_unit_id uuid DEFAULT NULL::uuid, p_billing_type text DEFAULT NULL::text, p_mes integer DEFAULT NULL::integer, p_ano integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text) RETURNS TABLE(status text, count bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT fcx.status, COUNT(*) AS count
  FROM public.financeiro_cobrancas_externas fcx
  JOIN public.financeiro_lancamentos l ON l.id = fcx.lancamento_id
  LEFT JOIN public.socios s ON s.cpf = l.socio_cpf AND s.tenant_id = p_tenant_id
  WHERE fcx.tenant_id = p_tenant_id
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = p_tenant_id
        AND tu.is_active = true
    )
    AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
    AND (p_billing_type IS NULL OR fcx.billing_type = p_billing_type)
    AND (p_mes IS NULL OR l.competencia_mes = p_mes)
    AND (p_ano IS NULL OR l.competencia_ano = p_ano)
    AND (p_search IS NULL OR p_search = '' OR
         l.socio_cpf ILIKE '%' || p_search || '%' OR
         s.nome ILIKE '%' || p_search || '%')
  GROUP BY fcx.status;
$$;

CREATE FUNCTION public.get_external_charges_list(p_tenant_id uuid, p_unit_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_billing_type text DEFAULT NULL::text, p_mes integer DEFAULT NULL::integer, p_ano integer DEFAULT NULL::integer, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, lancamento_id uuid, provider text, status text, billing_type text, valor numeric, data_vencimento date, payment_url text, error_message text, last_synced_at timestamp with time zone, webhook_received_at timestamp with time zone, created_at timestamp with time zone, lancamento_status text, competencia_ano integer, competencia_mes integer, socio_cpf text, socio_nome text, total_count bigint)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    fcx.id,
    fcx.lancamento_id,
    fcx.provider,
    fcx.status,
    fcx.billing_type,
    fcx.valor,
    fcx.data_vencimento,
    fcx.payment_url,
    fcx.error_message,
    fcx.last_synced_at,
    fcx.webhook_received_at,
    fcx.created_at,
    l.status            AS lancamento_status,
    l.competencia_ano,
    l.competencia_mes,
    l.socio_cpf,
    s.nome              AS socio_nome,
    COUNT(*) OVER ()    AS total_count
  FROM public.financeiro_cobrancas_externas fcx
  JOIN public.financeiro_lancamentos l ON l.id = fcx.lancamento_id
  LEFT JOIN public.socios s ON s.cpf = l.socio_cpf AND s.tenant_id = p_tenant_id
  WHERE fcx.tenant_id = p_tenant_id
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.user_id = auth.uid()
        AND tu.tenant_id = p_tenant_id
        AND tu.is_active = true
    )
    AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
    AND (p_status IS NULL OR fcx.status = p_status)
    AND (p_billing_type IS NULL OR fcx.billing_type = p_billing_type)
    AND (p_mes IS NULL OR l.competencia_mes = p_mes)
    AND (p_ano IS NULL OR l.competencia_ano = p_ano)
    AND (
      p_search IS NULL OR p_search = '' OR
      l.socio_cpf ILIKE '%' || p_search || '%' OR
      s.nome ILIKE '%' || p_search || '%'
    )
  ORDER BY fcx.created_at DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE FUNCTION public.get_finance_audit_log_v1(p_tenant_id uuid, p_unit_id uuid DEFAULT NULL::uuid, p_table_name text DEFAULT NULL::text, p_operation text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, table_name text, record_id uuid, operation text, old_data jsonb, new_data jsonb, changed_by uuid, user_nome text, user_email text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_is_tenant_admin boolean;
    v_is_unit_member boolean;
BEGIN
    SELECT (
        public.is_tenant_owner(p_tenant_id)
        OR EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = p_tenant_id AND tu.user_id = v_uid AND tu.is_active = true
              AND tu.operator_type = 'presidente'
        )
    ) INTO v_is_tenant_admin;

    IF v_is_tenant_admin THEN
        RETURN QUERY
        SELECT a.id, a.table_name, a.record_id, a.operation,
               a.old_data, a.new_data, a.changed_by,
               up.nome, up.email, a.created_at
        FROM public.audit_log_financeiro a
        LEFT JOIN public.user_profiles up ON up.id = a.changed_by
        WHERE a.tenant_id = p_tenant_id
          AND (p_table_name IS NULL OR a.table_name = p_table_name)
          AND (p_operation IS NULL OR a.operation = p_operation)
        ORDER BY a.created_at DESC LIMIT p_limit OFFSET p_offset;
        RETURN;
    END IF;

    IF p_unit_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_unit_memberships m
            WHERE m.tenant_id = p_tenant_id AND m.unit_id = p_unit_id
              AND m.user_id = v_uid AND m.is_active = true
        ) INTO v_is_unit_member;

        IF v_is_unit_member THEN
            RETURN QUERY
            SELECT a.id, a.table_name, a.record_id, a.operation,
                   a.old_data, a.new_data, a.changed_by,
                   up.nome, up.email, a.created_at
            FROM public.audit_log_financeiro a
            LEFT JOIN public.user_profiles up ON up.id = a.changed_by
            WHERE a.tenant_id = p_tenant_id AND a.unit_id = p_unit_id
              AND (p_table_name IS NULL OR a.table_name = p_table_name)
              AND (p_operation IS NULL OR a.operation = p_operation)
            ORDER BY a.created_at DESC LIMIT p_limit OFFSET p_offset;
            RETURN;
        END IF;
    END IF;

    RAISE EXCEPTION 'Acesso negado: sem permissao para visualizar auditoria financeira.';
END;
$$;

CREATE FUNCTION public.get_finance_tab_counts(p_search_term text DEFAULT ''::text, p_year integer DEFAULT NULL::integer, p_ano_base integer DEFAULT 2024) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.get_finance_tab_counts(p_search_term text DEFAULT ''::text, p_year integer DEFAULT NULL::integer, p_ano_base integer DEFAULT 2024, p_unit_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.get_members_by_birth_month(p_month integer, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, nome text, cpf text, data_de_nascimento date, codigo_do_socio text, total_count bigint)
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

CREATE FUNCTION public.get_next_cod_req() RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
    next_code INTEGER;
    formatted_code TEXT;
BEGIN
    LOCK TABLE requerimentos IN EXCLUSIVE MODE;
    SELECT COALESCE(
        MAX(CAST(cod_req AS INTEGER)), 
        0
    ) + 1 
    INTO next_code
    FROM requerimentos 
    WHERE cod_req ~ '^[0-9]+$';
    formatted_code := LPAD(next_code::text, 6, '0');
    RETURN formatted_code;
END;
$_$;

CREATE FUNCTION public.get_payments_by_period_paginated(p_start_date date, p_end_date date, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_order_by text DEFAULT 'data_pagamento'::text, p_order_dir text DEFAULT 'DESC'::text, p_unit_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_types text[] DEFAULT NULL::text[]) RETURNS TABLE(id uuid, data_pagamento date, tipo text, tipo_exibicao text, competencia_ano integer, competencia_mes integer, forma_pagamento text, valor numeric, created_at timestamp with time zone, socio_nome text, socio_cpf text, total_count bigint, total_amount numeric)
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

CREATE FUNCTION public.get_socio_financial_status(p_cpf text, p_regime text, p_isento boolean, p_liberado boolean) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN public.get_socio_financial_status(
      p_cpf,
      p_regime,
      p_isento,
      p_liberado,
      NULL
    );
END;
$$;

CREATE FUNCTION public.get_socio_financial_status(p_cpf text, p_regime text, p_isento boolean, p_liberado boolean, p_data_efetiva_inicio date) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_current_year int := EXTRACT(year FROM CURRENT_DATE);
    v_current_month int := EXTRACT(month FROM CURRENT_DATE);
    v_admission_date date := p_data_efetiva_inicio;
    v_first_required_month int := 1;
BEGIN
    IF p_isento OR p_liberado THEN
        RETURN 'ISENTO';
    END IF;

    IF v_admission_date IS NULL THEN
        SELECT s.data_de_admissao
          INTO v_admission_date
          FROM public.socios s
         WHERE s.cpf = p_cpf;
    END IF;

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
$$;

CREATE FUNCTION public.get_unit_stats() RETURNS TABLE(unit_id uuid, socios_count bigint, pending_req_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT
    tu.id AS unit_id,
    COUNT(DISTINCT s.id) AS socios_count,
    COUNT(DISTINCT r.id) FILTER (
      WHERE r.status_mte NOT IN ('deferido', 'indeferido')
        AND r.ano_referencia = EXTRACT(year FROM CURRENT_DATE)::int
    ) AS pending_req_count
  FROM tenant_units tu
  LEFT JOIN socios s ON s.unit_id = tu.id
  LEFT JOIN requerimentos r ON r.cpf = s.cpf
  WHERE tu.tenant_id IN (
    SELECT tenant_id FROM tenant_users
    WHERE user_id = auth.uid() AND is_active = true
  )
  GROUP BY tu.id;
$$;

CREATE FUNCTION public.handle_delete_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  delete from public.user_profiles where id = old.id;
  return old;
end;
$$;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  insert into public.user_profiles (id, email, nome, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', new.raw_app_meta_data->>'nome'),
    true
  )
  on conflict (id) do update
  set
    email = excluded.email,
    nome = coalesce(excluded.nome, public.user_profiles.nome),
    is_active = true,
    updated_at = now();

  return new;
end;
$$;

CREATE FUNCTION public.handle_update_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update public.user_profiles
    set email = new.email,
        nome = coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', new.raw_app_meta_data->>'nome', user_profiles.nome),
        updated_at = now()
  where id = new.id;

  return new;
end;
$$;

CREATE FUNCTION public.is_tenant_owner(p_tenant_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE tenant_id = p_tenant_id
        AND user_id = auth.uid()
        AND tenant_role = 'owner'
        AND is_active = true
    );
  END;
  $$;

CREATE FUNCTION public.is_tenant_presidente(p_tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid() AND tenant_id = p_tenant_id AND is_active = true AND operator_type = 'presidente'
  );
$$;

CREATE FUNCTION public.launch_bulk_contribution(p_tipo_cobranca_id uuid, p_unit_id uuid DEFAULT NULL::uuid) RETURNS integer
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

CREATE FUNCTION public.limpar_tokens_expirados_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM public.foto_upload_tokens WHERE expires_at < now();
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.list_requirements_extended(p_ano integer, p_status text DEFAULT 'all'::text, p_beneficio text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_carencia text DEFAULT 'all'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_unit_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, socio_id uuid, cod_req text, data_assinatura date, cpf text, ano_referencia integer, status_mte text, data_envio date, num_req_mte text, created_at timestamp with time zone, updated_at timestamp with time zone, beneficio_recebido boolean, socio_nome text, socio_nit text, socio_num_rgp text, socio_emissao_rgp date, total_count bigint)
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

CREATE FUNCTION public.prevent_technical_unit_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.is_technical THEN
    RAISE EXCEPTION 'Não é permitido excluir a unidade técnica (Sede) do tenant.';
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION public.prevent_technical_unit_demotion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.is_technical AND NOT NEW.is_technical THEN
    RAISE EXCEPTION 'Não é permitido reclassificar uma unidade técnica (Sede).';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.proc_audit_finance_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_record  jsonb;
  v_id      uuid;
BEGIN
  v_record := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_id     := CASE WHEN TG_OP = 'DELETE' THEN OLD.id        ELSE NEW.id        END;

  INSERT INTO public.audit_log_financeiro (
    table_name,
    record_id,
    operation,
    old_data,
    new_data,
    changed_by,
    tenant_id,
    unit_id
  )
  VALUES (
    TG_TABLE_NAME,
    v_id,
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    auth.uid(),
    (v_record ->> 'tenant_id')::uuid,
    (v_record ->> 'unit_id')::uuid
  );

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.process_data_import(p_table_name text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ 
DECLARE 
  v_count integer; 
  v_result jsonb; 
BEGIN 
  IF p_table_name NOT IN ('socios', 'financeiro', 'requerimentos') THEN 
    RAISE EXCEPTION 'Tabela não permitida para importação: %', p_table_name; 
  END IF; 
  EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, %L) ON CONFLICT DO NOTHING', p_table_name, p_table_name, p_data); 
  GET DIAGNOSTICS v_count = ROW_COUNT; 
  v_result := jsonb_build_object('success', true, 'processed_rows', v_count); 
  RETURN v_result; 
EXCEPTION WHEN OTHERS THEN 
  RETURN jsonb_build_object('success', false, 'error', SQLERRM); 
END; 
$$;

CREATE FUNCTION public.purge_cancelled_bulk_v1(p_older_than_days integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.purge_payment_v1(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
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

CREATE FUNCTION public.reap_batch_upsert_anual_v2(p_entries jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.reap_batch_upsert_simplificado(p_entries jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.reap_batch_upsert_simplificado_v2(p_entries jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.reap_upsert_anual_ano(p_cpf text, p_ano text, p_data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.reap_upsert_full(p_cpf text, p_simplificado jsonb, p_anual jsonb, p_observacoes text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.reap_upsert_simplificado_ano(p_cpf text, p_ano text, p_data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.register_payment_session(p_socio_cpf text, p_sessao_id uuid, p_forma_pagamento text, p_data_pagamento date, p_itens jsonb, p_daes jsonb DEFAULT '[]'::jsonb) RETURNS void
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

CREATE FUNCTION public.set_socios_audit_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_at IS NULL THEN
      NEW.created_at := now();
    END IF;

    IF NEW.updated_at IS NULL THEN
      NEW.updated_at := NEW.created_at;
    END IF;

    IF NEW.created_by IS NULL THEN
      NEW.created_by := v_actor;
    END IF;

    IF NEW.updated_by IS NULL THEN
      NEW.updated_by := COALESCE(v_actor, NEW.created_by);
    END IF;
  ELSE
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(v_actor, OLD.updated_by, OLD.created_by, NEW.updated_by);
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.socio_inadimplente_ano(p_cpf text, p_ano integer) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_isento              boolean;
  v_liberado_presidente boolean;
  v_regime              text;
  v_ano_base            integer;
  v_tem_pagamento       boolean;
BEGIN

  SELECT 
    COALESCE(isento, false),
    COALESCE(liberado_pelo_presidente, false)
  INTO v_isento, v_liberado_presidente
  FROM public.financeiro_config_socio WHERE cpf = p_cpf;

  IF v_isento OR v_liberado_presidente THEN RETURN false; END IF;

  SELECT ano_base_cobranca INTO v_ano_base FROM public.parametros_financeiros LIMIT 1;
  IF p_ano < v_ano_base THEN RETURN false; END IF;

  SELECT COALESCE(cfg.regime, pf.regime_padrao)
  INTO v_regime
  FROM (SELECT regime_padrao FROM public.parametros_financeiros LIMIT 1) pf
  LEFT JOIN public.financeiro_config_socio cfg ON cfg.cpf = p_cpf;

  IF v_regime = 'anuidade' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.financeiro_lancamentos
      WHERE socio_cpf = p_cpf AND tipo = 'anuidade'
        AND competencia_ano = p_ano AND status = 'pago'
    ) INTO v_tem_pagamento;
  ELSE
    SELECT NOT EXISTS(
      SELECT 1 FROM generate_series(1, EXTRACT(MONTH FROM CURRENT_DATE)::int) m
      WHERE NOT EXISTS (
        SELECT 1 FROM public.financeiro_lancamentos
        WHERE socio_cpf = p_cpf AND tipo = 'mensalidade'
          AND competencia_ano = p_ano AND competencia_mes = m AND status = 'pago'
      )
    ) INTO v_tem_pagamento;
  END IF;

  RETURN NOT v_tem_pagamento;
END;
$$;

CREATE FUNCTION public.update_dae_group(p_grupo_id uuid, p_new_year integer, p_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.update_extension_license(p_key text, p_unit_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;

CREATE FUNCTION public.update_member_regime(p_cpf text, p_novo_regime text, p_observacao text DEFAULT NULL::text) RETURNS void
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

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.audit_log_financeiro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    changed_by uuid,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    operation text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    tenant_id uuid,
    unit_id uuid
);

CREATE TABLE public.billing_summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    subscription_status text,
    plan_name text,
    next_billing_date date,
    has_pending_charge boolean DEFAULT false NOT NULL,
    pending_charge_amount numeric(10,2),
    payment_url text,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.billing_summary FORCE ROW LEVEL SECURITY;

CREATE SEQUENCE public.configuracao_entidade_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.configuracao_entidade (
    id integer DEFAULT nextval('public.configuracao_entidade_id_seq'::regclass) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    extensao_license_key text,
    cor_primaria text DEFAULT '160 84% 39%'::text NOT NULL,
    cor_secundaria text DEFAULT '152 69% 41%'::text NOT NULL,
    cor_sidebar text DEFAULT '160 84% 39%'::text NOT NULL,
    logo_path text,
    unit_id uuid,
    tenant_id uuid
);

CREATE TABLE public.configuracao_recebimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text DEFAULT 'manual'::text NOT NULL,
    api_key text,
    ambiente text DEFAULT 'sandbox'::text NOT NULL,
    webhook_token text,
    dia_vencimento integer DEFAULT 10 NOT NULL,
    forma_padrao text DEFAULT 'boleto'::text NOT NULL,
    envio_automatico boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT configuracao_recebimento_ambiente_check CHECK ((ambiente = ANY (ARRAY['sandbox'::text, 'producao'::text]))),
    CONSTRAINT configuracao_recebimento_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28))),
    CONSTRAINT configuracao_recebimento_forma_padrao_check CHECK ((forma_padrao = ANY (ARRAY['boleto'::text, 'pix'::text, 'link'::text]))),
    CONSTRAINT configuracao_recebimento_provider_check CHECK ((provider = ANY (ARRAY['manual'::text, 'asaas'::text])))
);

CREATE TABLE public.coordinators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    region text
);

CREATE TABLE public.entidade (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    fundacao text,
    email text,
    comarca text,
    numero text,
    nome_do_presidente text,
    cpf_do_presidente text,
    tenant_id uuid,
    unit_id uuid,
    tenant_mode text DEFAULT 'pesca'::text NOT NULL,
    CONSTRAINT entidade_tenant_mode_check CHECK ((tenant_mode = ANY (ARRAY['pesca'::text, 'agricultura'::text])))
);

CREATE TABLE public.financeiro_cobrancas_externas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lancamento_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    provider_charge_id text,
    status text DEFAULT 'pendente'::text NOT NULL,
    provider_status text,
    valor numeric,
    data_vencimento date,
    payment_url text,
    pix_code text,
    invoice_url text,
    provider_payload jsonb,
    error_message text,
    webhook_received_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    billing_type text,
    CONSTRAINT financeiro_cobrancas_externas_billing_type_check CHECK ((billing_type = ANY (ARRAY['BOLETO'::text, 'PIX'::text]))),
    CONSTRAINT financeiro_cobrancas_externas_provider_check CHECK ((provider = 'asaas'::text)),
    CONSTRAINT financeiro_cobrancas_externas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'paga'::text, 'cancelada'::text, 'expirada'::text, 'falha'::text])))
);

CREATE TABLE public.financeiro_cobrancas_geradas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_cobranca_id uuid NOT NULL,
    socio_cpf text NOT NULL,
    valor numeric(10,2) NOT NULL,
    data_lancamento date DEFAULT CURRENT_DATE NOT NULL,
    data_vencimento date,
    lancamento_id uuid,
    status text DEFAULT 'pendente'::text NOT NULL,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_cancelamento_audit_cobrancas CHECK ((((status = 'cancelado'::text) AND (cancelado_por IS NOT NULL)) OR (status <> 'cancelado'::text))),
    CONSTRAINT financeiro_cobrancas_geradas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'pago'::text, 'cancelado'::text])))
);

CREATE TABLE public.financeiro_config_socio (
    cpf text NOT NULL,
    regime text,
    referencia_vencimento text,
    dia_vencimento integer,
    isento boolean DEFAULT false NOT NULL,
    motivo_isencao text,
    liberado_pelo_presidente boolean DEFAULT false NOT NULL,
    liberacao_observacao text,
    liberacao_data timestamp with time zone,
    liberacao_usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    socio_historico boolean DEFAULT false NOT NULL,
    data_inicio_cobranca date,
    CONSTRAINT financeiro_config_socio_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28))),
    CONSTRAINT financeiro_config_socio_referencia_vencimento_check CHECK ((referencia_vencimento = ANY (ARRAY['dia_fixo'::text, 'admissao'::text, 'rgp'::text]))),
    CONSTRAINT financeiro_config_socio_regime_check CHECK ((regime = ANY (ARRAY['anuidade'::text, 'mensalidade'::text])))
);

CREATE TABLE public.financeiro_dae (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text NOT NULL,
    tipo_boleto text NOT NULL,
    competencia_ano integer NOT NULL,
    competencia_mes integer NOT NULL,
    grupo_id uuid,
    sessao_id uuid,
    valor numeric(10,2) NOT NULL,
    forma_pagamento text NOT NULL,
    boleto_pago boolean DEFAULT false NOT NULL,
    data_pagamento_boleto date,
    status text DEFAULT 'pago'::text NOT NULL,
    registrado_por uuid,
    data_recebimento date DEFAULT CURRENT_DATE NOT NULL,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_cancelamento_audit_dae CHECK ((((status = 'cancelado'::text) AND (cancelado_por IS NOT NULL)) OR (status <> 'cancelado'::text))),
    CONSTRAINT financeiro_dae_competencia_mes_check CHECK (((competencia_mes >= 1) AND (competencia_mes <= 12))),
    CONSTRAINT financeiro_dae_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'transferencia'::text, 'boleto'::text, 'cartao'::text]))),
    CONSTRAINT financeiro_dae_status_check CHECK ((status = ANY (ARRAY['pago'::text, 'cancelado'::text]))),
    CONSTRAINT financeiro_dae_tipo_boleto_check CHECK ((tipo_boleto = ANY (ARRAY['unitario'::text, 'agrupado'::text, 'anual'::text])))
);

CREATE TABLE public.financeiro_historico_regime (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text NOT NULL,
    regime text NOT NULL,
    vigente_desde date NOT NULL,
    vigente_ate date,
    alterado_por uuid,
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT financeiro_historico_regime_regime_check CHECK ((regime = ANY (ARRAY['anuidade'::text, 'mensalidade'::text])))
);

CREATE TABLE public.financeiro_lancamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text NOT NULL,
    sessao_id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    tipo_cobranca_id uuid,
    competencia_ano integer,
    competencia_mes integer,
    valor numeric(10,2) NOT NULL,
    forma_pagamento text NOT NULL,
    descricao text,
    status text DEFAULT 'pago'::text NOT NULL,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    registrado_por uuid,
    data_pagamento date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_cancelamento_audit_lancamentos CHECK ((((status = 'cancelado'::text) AND (cancelado_por IS NOT NULL)) OR (status <> 'cancelado'::text))),
    CONSTRAINT chk_tipo_cobranca CHECK ((((tipo = ANY (ARRAY['contribuicao'::text, 'cadastro_governamental'::text])) AND (tipo_cobranca_id IS NOT NULL)) OR ((tipo <> ALL (ARRAY['contribuicao'::text, 'cadastro_governamental'::text])) AND (tipo_cobranca_id IS NULL)))),
    CONSTRAINT financeiro_lancamentos_competencia_mes_check CHECK (((competencia_mes >= 1) AND (competencia_mes <= 12))),
    CONSTRAINT financeiro_lancamentos_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'transferencia'::text, 'boleto'::text, 'cartao'::text]))),
    CONSTRAINT financeiro_lancamentos_status_check CHECK ((status = ANY (ARRAY['pago'::text, 'cancelado'::text, 'pendente'::text]))),
    CONSTRAINT financeiro_lancamentos_tipo_check CHECK ((tipo = ANY (ARRAY['anuidade'::text, 'mensalidade'::text, 'inicial'::text, 'transferencia'::text, 'contribuicao'::text, 'cadastro_governamental'::text])))
);

CREATE TABLE public.foto_upload_tokens (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text,
    foto_base64 text,
    foto_url text,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid,
    unit_id uuid
);

CREATE TABLE public.localidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_localidade text,
    nome text,
    tenant_id uuid NOT NULL,
    unit_id uuid NOT NULL
);

CREATE TABLE public.logs_eventos_requerimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requerimento_id uuid,
    tipo_evento text,
    descricao text,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT logs_eventos_requerimento_tipo_evento_check CHECK ((tipo_evento = ANY (ARRAY['mudanca_status'::text, 'confirmacao_beneficio'::text])))
);

CREATE TABLE public.parametros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nr_publicacao text,
    data_publicacao date,
    local_pesca text,
    inicio_pesca1 date,
    final_pesca1 date,
    inicio_pesca2 date,
    final_pesca2 date,
    especies_proibidas text,
    localpesca text,
    tenant_id uuid,
    unit_id uuid NOT NULL
);

CREATE TABLE public.parametros_financeiros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    regime_padrao text DEFAULT 'anuidade'::text,
    dia_vencimento integer DEFAULT 1,
    ano_base_cobranca integer DEFAULT 2024,
    valor_anuidade numeric(10,2),
    valor_mensalidade numeric(10,2),
    valor_inscricao numeric(10,2),
    valor_transferencia numeric(10,2),
    bloquear_inadimplente boolean DEFAULT true,
    anos_atraso_alerta integer DEFAULT 1,
    cobra_multa boolean DEFAULT false,
    percentual_multa numeric(10,2),
    cobra_juros boolean DEFAULT false,
    percentual_juros_mes numeric(10,2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid,
    unit_id uuid,
    CONSTRAINT parametros_financeiros_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28))),
    CONSTRAINT parametros_financeiros_regime_padrao_check CHECK ((regime_padrao = ANY (ARRAY['anuidade'::text, 'mensalidade'::text])))
);

CREATE TABLE public.portarias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    unit_id uuid,
    codigo_portaria text NOT NULL,
    nome text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reap (
    cpf text NOT NULL,
    simplificado jsonb DEFAULT '{}'::jsonb NOT NULL,
    anual jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    observacoes text
);

CREATE TABLE public.socios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    cpf text NOT NULL,
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
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid,
    unit_id uuid,
    portaria_id uuid,
    caf text,
    coordinator_id uuid,
    created_by uuid,
    updated_by uuid
);

CREATE VIEW public.reap_list_view AS
 SELECT s.cpf,
    s.nome,
    s.nit,
    s.emissao_rgp,
    s.situacao,
    s.unit_id,
    r.simplificado,
    r.anual,
    r.observacoes,
    r.updated_at,
        CASE
            WHEN (r.cpf IS NULL) THEN 'sem_reap'::text
            WHEN (((r.simplificado)::text ~~* '%"tem_problema": true%'::text) OR ((r.anual)::text ~~* '%"tem_problema": true%'::text)) THEN 'tem_problema'::text
            WHEN (((r.simplificado)::text ~~* '%"enviado": false%'::text) OR ((r.anual)::text ~~* '%"enviado": false%'::text)) THEN 'pendente'::text
            ELSE 'em_dia'::text
        END AS reap_status
   FROM (public.socios s
     LEFT JOIN public.reap r ON ((s.cpf = r.cpf)));

CREATE TABLE public.requerimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cod_req text,
    data_assinatura date,
    cpf text,
    ano_referencia integer NOT NULL,
    status_mte text DEFAULT 'nao_assinado'::text NOT NULL,
    data_envio date,
    num_req_mte text,
    beneficio_recebido boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT requerimentos_status_mte_check CHECK ((status_mte = ANY (ARRAY['assinado'::text, 'analise'::text, 'recurso_acerto'::text, 'deferido'::text, 'indeferido'::text])))
);

CREATE TABLE public.templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text,
    document_type text,
    file_path text,
    file_url text,
    file_size bigint,
    content_type text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    font_configurations text,
    tenant_id uuid
);

CREATE TABLE public.tenant_units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    city text,
    state text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_technical boolean DEFAULT false NOT NULL
);

CREATE TABLE public.tenant_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tenant_role text DEFAULT 'member'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    operator_type text,
    CONSTRAINT tenant_users_operator_type_check CHECK ((((tenant_role = 'owner'::text) AND (operator_type IS NULL)) OR ((tenant_role = 'member'::text) AND (operator_type = ANY (ARRAY['presidente'::text, 'auxiliar'::text]))))),
    CONSTRAINT tenant_users_tenant_role_check CHECK ((tenant_role = ANY (ARRAY['owner'::text, 'member'::text])))
);

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    max_socios integer,
    acesso_expira_em timestamp with time zone,
    CONSTRAINT tenants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);

CREATE TABLE public.tipos_cobranca (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria text NOT NULL,
    nome text NOT NULL,
    descricao text,
    valor_padrao numeric(10,2),
    obrigatoriedade text,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid,
    unit_id uuid,
    CONSTRAINT chk_obrigatoriedade CHECK ((((categoria = 'contribuicao'::text) AND (obrigatoriedade IS NOT NULL)) OR ((categoria = 'cadastro_governamental'::text) AND (obrigatoriedade IS NULL)))),
    CONSTRAINT tipos_cobranca_categoria_check CHECK ((categoria = ANY (ARRAY['contribuicao'::text, 'cadastro_governamental'::text]))),
    CONSTRAINT tipos_cobranca_obrigatoriedade_check CHECK ((obrigatoriedade = ANY (ARRAY['compulsoria'::text, 'facultativa'::text])))
);

CREATE TABLE public.user_presence (
    user_id uuid NOT NULL,
    tenant_id uuid,
    unit_id uuid,
    user_name text,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    current_route text
);

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    email text,
    nome text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    avatar_path text
);

CREATE TABLE public.user_unit_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE VIEW public.v_debitos_socio AS
 WITH anos AS (
         SELECT generate_series(( SELECT COALESCE(min(parametros_financeiros.ano_base_cobranca), 2024) AS "coalesce"
                   FROM public.parametros_financeiros), (EXTRACT(year FROM CURRENT_DATE))::integer) AS ano
        )
 SELECT s.cpf,
    s.nome,
    a.ano,
    (NOT (EXISTS ( SELECT 1
           FROM public.financeiro_lancamentos fl
          WHERE ((fl.socio_cpf = s.cpf) AND (fl.tipo = 'anuidade'::text) AND (fl.competencia_ano = a.ano) AND (fl.status = 'pago'::text))))) AS anuidade_pendente,
    COALESCE(cfg.isento, false) AS isento,
    COALESCE(cfg.liberado_pelo_presidente, false) AS liberado
   FROM (((public.socios s
     CROSS JOIN anos a)
     LEFT JOIN ( SELECT parametros_financeiros.regime_padrao
           FROM public.parametros_financeiros
         LIMIT 1) pf ON (true))
     LEFT JOIN public.financeiro_config_socio cfg ON ((cfg.cpf = s.cpf)))
  WHERE ((COALESCE(cfg.regime, pf.regime_padrao) = 'anuidade'::text) AND (a.ano >= ( SELECT COALESCE(min(parametros_financeiros.ano_base_cobranca), 2024) AS "coalesce"
           FROM public.parametros_financeiros)));

CREATE VIEW public.v_requerimentos_busca WITH (security_invoker='true') AS
 SELECT r.id,
    r.cod_req,
    r.data_assinatura,
    r.cpf,
    r.ano_referencia,
    r.status_mte,
    r.data_envio,
    r.num_req_mte,
    r.created_at,
    r.updated_at,
    r.beneficio_recebido,
    s.nome AS socio_nome,
    s.nit AS socio_nit,
    s.emissao_rgp
   FROM (public.requerimentos r
     LEFT JOIN public.socios s ON ((r.cpf = s.cpf)));

CREATE VIEW public.v_situacao_financeira_socio WITH (security_invoker='true') AS
 WITH base AS (
         SELECT s.cpf,
            s.nome,
            s.unit_id,
            s.data_de_admissao,
            COALESCE(cfg.data_inicio_cobranca, s.data_de_admissao) AS data_efetiva_inicio_cobranca,
            s.situacao AS situacao_associativa,
            COALESCE(cfg.regime, pf.regime_padrao) AS regime,
            COALESCE(cfg.isento, false) AS isento,
            COALESCE(cfg.liberado_pelo_presidente, false) AS liberado_presidente,
            array_agg(fl.competencia_ano ORDER BY fl.competencia_ano) FILTER (WHERE ((fl.tipo = 'anuidade'::text) AND (fl.status = 'pago'::text))) AS anuidades_pagas,
            max(fl.data_pagamento) AS ultimo_pagamento,
            array_agg(fl.competencia_mes ORDER BY fl.competencia_mes) FILTER (WHERE ((fl.tipo = 'mensalidade'::text) AND (fl.status = 'pago'::text) AND (fl.competencia_ano = (EXTRACT(year FROM CURRENT_DATE))::integer))) AS meses_pagos_atual
           FROM (((public.socios s
             LEFT JOIN ( SELECT parametros_financeiros.regime_padrao
                   FROM public.parametros_financeiros
                 LIMIT 1) pf ON (true))
             LEFT JOIN public.financeiro_config_socio cfg ON ((cfg.cpf = s.cpf)))
             LEFT JOIN public.financeiro_lancamentos fl ON ((fl.socio_cpf = s.cpf)))
          GROUP BY s.cpf, s.nome, s.unit_id, s.data_de_admissao, cfg.data_inicio_cobranca, s.situacao, cfg.regime, pf.regime_padrao, cfg.isento, cfg.liberado_pelo_presidente
        )
 SELECT cpf,
    nome,
    unit_id,
    situacao_associativa,
    regime,
    isento,
    liberado_presidente,
    anuidades_pagas,
    ultimo_pagamento,
    public.get_socio_financial_status(cpf, regime, isento, liberado_presidente, data_efetiva_inicio_cobranca) AS situacao_geral,
    meses_pagos_atual,
    data_de_admissao
   FROM base;

ALTER TABLE ONLY public.audit_log_financeiro
    ADD CONSTRAINT audit_log_financeiro_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.billing_summary
    ADD CONSTRAINT billing_summary_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.configuracao_entidade
    ADD CONSTRAINT configuracao_entidade_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.configuracao_recebimento
    ADD CONSTRAINT configuracao_recebimento_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.configuracao_recebimento
    ADD CONSTRAINT configuracao_recebimento_tenant_id_key UNIQUE (tenant_id);

ALTER TABLE ONLY public.coordinators
    ADD CONSTRAINT coordinators_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.entidade
    ADD CONSTRAINT entidade_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.financeiro_cobrancas_externas
    ADD CONSTRAINT financeiro_cobrancas_externas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_tipo_cobranca_id_socio_cpf_key UNIQUE (tipo_cobranca_id, socio_cpf);

ALTER TABLE ONLY public.financeiro_config_socio
    ADD CONSTRAINT financeiro_config_socio_pkey PRIMARY KEY (cpf);

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.financeiro_historico_regime
    ADD CONSTRAINT financeiro_historico_regime_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.foto_upload_tokens
    ADD CONSTRAINT foto_upload_tokens_pkey PRIMARY KEY (token);

ALTER TABLE ONLY public.localidades
    ADD CONSTRAINT localidades_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.logs_eventos_requerimento
    ADD CONSTRAINT logs_eventos_requerimento_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.parametros_financeiros
    ADD CONSTRAINT parametros_financeiros_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.parametros
    ADD CONSTRAINT parametros_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.portarias
    ADD CONSTRAINT portarias_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reap
    ADD CONSTRAINT reap_pkey PRIMARY KEY (cpf);

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT requerimentos_cod_req_key UNIQUE (cod_req);

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT requerimentos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_cpf_key UNIQUE (cpf);

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenant_units
    ADD CONSTRAINT tenant_units_id_tenant_id_key UNIQUE (id, tenant_id);

ALTER TABLE ONLY public.tenant_units
    ADD CONSTRAINT tenant_units_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenant_units
    ADD CONSTRAINT tenant_units_tenant_id_code_key UNIQUE (tenant_id, code);

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_tenant_id_user_id_key UNIQUE (tenant_id, user_id);

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_code_key UNIQUE (code);

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tipos_cobranca
    ADD CONSTRAINT tipos_cobranca_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT unique_cpf_ano UNIQUE (cpf, ano_referencia);

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_user_tenant_unit_unique UNIQUE (user_id, tenant_id, unit_id);

CREATE UNIQUE INDEX billing_summary_tenant_id_uniq ON public.billing_summary USING btree (tenant_id) WHERE (tenant_id IS NOT NULL);

CREATE UNIQUE INDEX configuracao_entidade_unit_id_unique ON public.configuracao_entidade USING btree (unit_id) WHERE (unit_id IS NOT NULL);

CREATE UNIQUE INDEX coordinators_uniq_per_unit ON public.coordinators USING btree (tenant_id, unit_id, name);

CREATE UNIQUE INDEX fcx_lancamento_ativo_idx ON public.financeiro_cobrancas_externas USING btree (lancamento_id) WHERE (status = ANY (ARRAY['pendente'::text, 'paga'::text]));

CREATE INDEX fcx_lancamento_historico_idx ON public.financeiro_cobrancas_externas USING btree (lancamento_id);

CREATE UNIQUE INDEX fcx_provider_charge_idx ON public.financeiro_cobrancas_externas USING btree (provider, provider_charge_id) WHERE (provider_charge_id IS NOT NULL);

CREATE INDEX fcx_tenant_idx ON public.financeiro_cobrancas_externas USING btree (tenant_id);

CREATE UNIQUE INDEX financeiro_dae_active_month_idx ON public.financeiro_dae USING btree (socio_cpf, competencia_ano, competencia_mes) WHERE (status <> 'cancelado'::text);

CREATE INDEX idx_audit_log_changed_by ON public.audit_log_financeiro USING btree (changed_by);

CREATE INDEX idx_cobrancas_socio ON public.financeiro_cobrancas_geradas USING btree (socio_cpf);

CREATE INDEX idx_cobrancas_status ON public.financeiro_cobrancas_geradas USING btree (status);

CREATE INDEX idx_cobrancas_tipo ON public.financeiro_cobrancas_geradas USING btree (tipo_cobranca_id);

CREATE INDEX idx_configuracao_entidade_unit_id ON public.configuracao_entidade USING btree (unit_id);

CREATE INDEX idx_dae_comp ON public.financeiro_dae USING btree (competencia_ano, competencia_mes);

CREATE INDEX idx_dae_grupo ON public.financeiro_dae USING btree (grupo_id);

CREATE INDEX idx_dae_sessao ON public.financeiro_dae USING btree (sessao_id);

CREATE INDEX idx_dae_socio ON public.financeiro_dae USING btree (socio_cpf);

CREATE INDEX idx_entidade_tenant_id ON public.entidade USING btree (tenant_id);

CREATE INDEX idx_entidade_unit_id ON public.entidade USING btree (unit_id);

CREATE INDEX idx_fin_cfg_liberacao_usuario ON public.financeiro_config_socio USING btree (liberacao_usuario_id);

CREATE INDEX idx_fin_cob_cancelado_por ON public.financeiro_cobrancas_geradas USING btree (cancelado_por);

CREATE INDEX idx_fin_cob_lancamento_id ON public.financeiro_cobrancas_geradas USING btree (lancamento_id);

CREATE INDEX idx_fin_dae_cancelado_por ON public.financeiro_dae USING btree (cancelado_por);

CREATE INDEX idx_fin_dae_registrado_por ON public.financeiro_dae USING btree (registrado_por);

CREATE INDEX idx_fin_hist_alterado_por ON public.financeiro_historico_regime USING btree (alterado_por);

CREATE INDEX idx_fin_lanc_cancelado_por ON public.financeiro_lancamentos USING btree (cancelado_por);

CREATE INDEX idx_fin_lanc_comp_ano ON public.financeiro_lancamentos USING btree (competencia_ano);

CREATE INDEX idx_fin_lanc_data ON public.financeiro_lancamentos USING btree (data_pagamento);

CREATE INDEX idx_fin_lanc_registrado_por ON public.financeiro_lancamentos USING btree (registrado_por);

CREATE INDEX idx_fin_lanc_sessao ON public.financeiro_lancamentos USING btree (sessao_id);

CREATE INDEX idx_fin_lanc_socio ON public.financeiro_lancamentos USING btree (socio_cpf);

CREATE INDEX idx_fin_lanc_socio_tipo_comp ON public.financeiro_lancamentos USING btree (socio_cpf, tipo, competencia_ano, competencia_mes);

CREATE INDEX idx_fin_lanc_status ON public.financeiro_lancamentos USING btree (status);

CREATE INDEX idx_fin_lanc_tipo ON public.financeiro_lancamentos USING btree (tipo);

CREATE INDEX idx_fin_lanc_tipo_cobranca ON public.financeiro_lancamentos USING btree (tipo_cobranca_id);

CREATE INDEX idx_foto_tokens_expires ON public.foto_upload_tokens USING btree (expires_at);

CREATE INDEX idx_foto_upload_tokens_scope ON public.foto_upload_tokens USING btree (tenant_id, unit_id);

CREATE INDEX idx_logs_req_requerimento_id ON public.logs_eventos_requerimento USING btree (requerimento_id);

CREATE INDEX idx_logs_req_usuario_id ON public.logs_eventos_requerimento USING btree (usuario_id);

CREATE INDEX idx_parametros_financeiros_tenant_id ON public.parametros_financeiros USING btree (tenant_id);

CREATE INDEX idx_parametros_financeiros_unit_id ON public.parametros_financeiros USING btree (unit_id);

CREATE INDEX idx_regime_socio ON public.financeiro_historico_regime USING btree (socio_cpf);

CREATE INDEX idx_socios_birth_month ON public.socios USING btree (EXTRACT(month FROM data_de_nascimento));

CREATE INDEX idx_socios_codigo_socio_trgm ON public.socios USING gin (codigo_do_socio public.gin_trgm_ops);

CREATE INDEX idx_socios_cpf_trgm ON public.socios USING gin (cpf public.gin_trgm_ops);

CREATE INDEX idx_socios_nome_trgm ON public.socios USING gin (nome public.gin_trgm_ops);

CREATE INDEX idx_tipos_cobranca_ativo ON public.tipos_cobranca USING btree (ativo);

CREATE INDEX idx_tipos_cobranca_categoria ON public.tipos_cobranca USING btree (categoria);

CREATE INDEX parametros_tenant_id_idx ON public.parametros USING btree (tenant_id);

CREATE UNIQUE INDEX portarias_uniq_with_unit ON public.portarias USING btree (tenant_id, unit_id, codigo_portaria) WHERE (unit_id IS NOT NULL);

CREATE UNIQUE INDEX portarias_uniq_without_unit ON public.portarias USING btree (tenant_id, codigo_portaria) WHERE (unit_id IS NULL);

CREATE INDEX socios_coordinator_id_idx ON public.socios USING btree (coordinator_id);

CREATE INDEX socios_created_by_idx ON public.socios USING btree (created_by);

CREATE INDEX socios_updated_by_idx ON public.socios USING btree (updated_by);

CREATE INDEX templates_tenant_id_idx ON public.templates USING btree (tenant_id);

CREATE UNIQUE INDEX tenant_units_tenant_id_id_idx ON public.tenant_units USING btree (tenant_id, id);

CREATE INDEX tenant_units_tenant_id_idx ON public.tenant_units USING btree (tenant_id);

CREATE UNIQUE INDEX uniq_anuidade_por_ano ON public.financeiro_lancamentos USING btree (socio_cpf, competencia_ano) WHERE ((tipo = 'anuidade'::text) AND (status = 'pago'::text));

CREATE UNIQUE INDEX uniq_mensalidade_por_mes ON public.financeiro_lancamentos USING btree (socio_cpf, competencia_ano, competencia_mes) WHERE ((tipo = 'mensalidade'::text) AND (status = 'pago'::text));

CREATE INDEX user_unit_memberships_tenant_id_idx ON public.user_unit_memberships USING btree (tenant_id);

CREATE INDEX user_unit_memberships_unit_id_idx ON public.user_unit_memberships USING btree (unit_id) WHERE (unit_id IS NOT NULL);

CREATE INDEX user_unit_memberships_user_id_idx ON public.user_unit_memberships USING btree (user_id);

CREATE TRIGGER no_delete_technical_unit BEFORE DELETE ON public.tenant_units FOR EACH ROW EXECUTE FUNCTION public.prevent_technical_unit_delete();

CREATE TRIGGER no_demote_technical_unit BEFORE UPDATE ON public.tenant_units FOR EACH ROW EXECUTE FUNCTION public.prevent_technical_unit_demotion();

CREATE TRIGGER set_tenant_users_updated_at BEFORE UPDATE ON public.tenant_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenant_units_set_updated_at BEFORE UPDATE ON public.tenant_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_audit_parametros_financeiros AFTER INSERT OR DELETE OR UPDATE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();

CREATE TRIGGER tr_audit_tipos_cobranca AFTER INSERT OR DELETE OR UPDATE ON public.tipos_cobranca FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();

CREATE TRIGGER tr_check_member_limit BEFORE INSERT ON public.socios FOR EACH ROW EXECUTE FUNCTION public.check_member_limit();

CREATE TRIGGER trg_auto_membership_single_unit AFTER INSERT ON public.tenant_users FOR EACH ROW WHEN ((new.is_active = true)) EXECUTE FUNCTION public.auto_membership_single_unit();

CREATE TRIGGER trg_auxiliar_single_membership BEFORE INSERT OR UPDATE ON public.user_unit_memberships FOR EACH ROW EXECUTE FUNCTION public.chk_auxiliar_single_membership();

CREATE TRIGGER trg_cobrancas_geradas_upd BEFORE UPDATE ON public.financeiro_cobrancas_geradas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fin_config_socio_upd BEFORE UPDATE ON public.financeiro_config_socio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fin_dae_upd BEFORE UPDATE ON public.financeiro_dae FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fin_lancamentos_upd BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_limpar_tokens_expirados AFTER INSERT ON public.foto_upload_tokens FOR EACH STATEMENT EXECUTE FUNCTION public.limpar_tokens_expirados_trigger();

CREATE TRIGGER trg_no_owner_membership BEFORE INSERT OR UPDATE ON public.user_unit_memberships FOR EACH ROW EXECUTE FUNCTION public.chk_no_owner_membership();

CREATE TRIGGER trg_no_role_transition BEFORE UPDATE ON public.tenant_users FOR EACH ROW EXECUTE FUNCTION public.chk_no_role_transition();

CREATE TRIGGER trg_parametros_financeiros_upd BEFORE UPDATE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_set_socios_audit_fields BEFORE INSERT OR UPDATE ON public.socios FOR EACH ROW EXECUTE FUNCTION public.set_socios_audit_fields();

CREATE TRIGGER trg_socios_upd BEFORE UPDATE ON public.socios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tenant_units_min_one BEFORE DELETE OR UPDATE ON public.tenant_units FOR EACH ROW EXECUTE FUNCTION public.fn_tenant_units_min_one();

CREATE TRIGGER trg_tipos_cobranca_upd BEFORE UPDATE ON public.tipos_cobranca FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_auto_generate_cod_req BEFORE INSERT ON public.requerimentos FOR EACH ROW EXECUTE FUNCTION public.auto_generate_cod_req();

CREATE TRIGGER trigger_generate_codigo_localidade BEFORE INSERT ON public.localidades FOR EACH ROW EXECUTE FUNCTION public.generate_next_codigo_localidade();

CREATE TRIGGER user_profiles_set_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER user_unit_memberships_set_updated_at BEFORE UPDATE ON public.user_unit_memberships FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE ONLY public.audit_log_financeiro
    ADD CONSTRAINT audit_log_financeiro_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.audit_log_financeiro
    ADD CONSTRAINT audit_log_financeiro_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.audit_log_financeiro
    ADD CONSTRAINT audit_log_financeiro_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.configuracao_entidade
    ADD CONSTRAINT configuracao_entidade_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.entidade
    ADD CONSTRAINT entidade_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.entidade
    ADD CONSTRAINT entidade_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.financeiro_cobrancas_externas
    ADD CONSTRAINT financeiro_cobrancas_externas_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.financeiro_lancamentos(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.financeiro_lancamentos(id);

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_tipo_cobranca_id_fkey FOREIGN KEY (tipo_cobranca_id) REFERENCES public.tipos_cobranca(id);

ALTER TABLE ONLY public.financeiro_config_socio
    ADD CONSTRAINT financeiro_config_socio_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf);

ALTER TABLE ONLY public.financeiro_config_socio
    ADD CONSTRAINT financeiro_config_socio_liberacao_usuario_id_fkey FOREIGN KEY (liberacao_usuario_id) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);

ALTER TABLE ONLY public.financeiro_historico_regime
    ADD CONSTRAINT financeiro_historico_regime_alterado_por_fkey FOREIGN KEY (alterado_por) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.financeiro_historico_regime
    ADD CONSTRAINT financeiro_historico_regime_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf) ON UPDATE CASCADE;

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_tipo_cobranca_id_fkey FOREIGN KEY (tipo_cobranca_id) REFERENCES public.tipos_cobranca(id);

ALTER TABLE ONLY public.localidades
    ADD CONSTRAINT localidades_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.localidades
    ADD CONSTRAINT localidades_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.logs_eventos_requerimento
    ADD CONSTRAINT logs_eventos_requerimento_requerimento_id_fkey FOREIGN KEY (requerimento_id) REFERENCES public.requerimentos(id);

ALTER TABLE ONLY public.logs_eventos_requerimento
    ADD CONSTRAINT logs_eventos_requerimento_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.user_profiles(id);

ALTER TABLE ONLY public.parametros_financeiros
    ADD CONSTRAINT parametros_financeiros_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.parametros_financeiros
    ADD CONSTRAINT parametros_financeiros_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.parametros
    ADD CONSTRAINT parametros_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.parametros
    ADD CONSTRAINT parametros_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.reap
    ADD CONSTRAINT reap_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf) ON DELETE RESTRICT;

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT requerimentos_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf) ON DELETE CASCADE;

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_coordinator_id_fkey FOREIGN KEY (coordinator_id) REFERENCES public.coordinators(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_portaria_id_fkey FOREIGN KEY (portaria_id) REFERENCES public.portarias(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.tenant_units
    ADD CONSTRAINT tenant_units_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tipos_cobranca
    ADD CONSTRAINT tipos_cobranca_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.tipos_cobranca
    ADD CONSTRAINT tipos_cobranca_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_tenant_unit_fk FOREIGN KEY (tenant_id, unit_id) REFERENCES public.tenant_units(tenant_id, id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_tenant_user_fk FOREIGN KEY (tenant_id, user_id) REFERENCES public.tenant_users(tenant_id, user_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.audit_log_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_financeiro_select ON public.audit_log_financeiro FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = audit_log_financeiro.tenant_id) AND (m.unit_id = audit_log_financeiro.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.billing_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_summary_select_authenticated ON public.billing_summary FOR SELECT TO authenticated USING (((tenant_id IS NULL) OR public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.tenant_id = billing_summary.tenant_id) AND (tu.is_active = true))))));

CREATE POLICY cfg_recebimento_write_presidente ON public.configuracao_recebimento TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.is_active = true) AND (tu.tenant_id = configuracao_recebimento.tenant_id) AND (tu.operator_type = 'presidente'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.is_active = true) AND (tu.tenant_id = configuracao_recebimento.tenant_id) AND (tu.operator_type = 'presidente'::text)))));

ALTER TABLE public.configuracao_entidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY configuracao_entidade_insert ON public.configuracao_entidade FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = configuracao_entidade.tenant_id) AND (m.unit_id = configuracao_entidade.unit_id) AND (m.is_active = true))))));

CREATE POLICY configuracao_entidade_select ON public.configuracao_entidade FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = configuracao_entidade.tenant_id) AND (m.unit_id = configuracao_entidade.unit_id) AND (m.is_active = true))))));

CREATE POLICY configuracao_entidade_update ON public.configuracao_entidade FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = configuracao_entidade.tenant_id) AND (m.unit_id = configuracao_entidade.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = configuracao_entidade.tenant_id) AND (m.unit_id = configuracao_entidade.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.configuracao_recebimento ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.coordinators ENABLE ROW LEVEL SECURITY;

CREATE POLICY coordinators_delete ON public.coordinators FOR DELETE TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = coordinators.tenant_id) AND (m.unit_id = coordinators.unit_id) AND (m.is_active = true))))));

CREATE POLICY coordinators_insert ON public.coordinators FOR INSERT TO authenticated WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = coordinators.tenant_id) AND (m.unit_id = coordinators.unit_id) AND (m.is_active = true))))));

CREATE POLICY coordinators_select ON public.coordinators FOR SELECT TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = coordinators.tenant_id) AND (m.unit_id = coordinators.unit_id) AND (m.is_active = true))))));

CREATE POLICY coordinators_update ON public.coordinators FOR UPDATE TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = coordinators.tenant_id) AND (m.unit_id = coordinators.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = coordinators.tenant_id) AND (m.unit_id = coordinators.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.entidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY entidade_insert ON public.entidade FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = entidade.tenant_id) AND (m.unit_id = entidade.unit_id) AND (m.is_active = true))))));

CREATE POLICY entidade_select ON public.entidade FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = entidade.tenant_id) AND (m.unit_id = entidade.unit_id) AND (m.is_active = true))))));

CREATE POLICY entidade_update ON public.entidade FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = entidade.tenant_id) AND (m.unit_id = entidade.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = entidade.tenant_id) AND (m.unit_id = entidade.unit_id) AND (m.is_active = true))))));

CREATE POLICY fcx_select_tenant ON public.financeiro_cobrancas_externas FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.is_active = true) AND (tu.tenant_id = financeiro_cobrancas_externas.tenant_id)))));

ALTER TABLE public.financeiro_cobrancas_externas ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financeiro_cobrancas_geradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_cobrancas_geradas_delete ON public.financeiro_cobrancas_geradas FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_cobrancas_geradas_insert ON public.financeiro_cobrancas_geradas FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_cobrancas_geradas_select ON public.financeiro_cobrancas_geradas FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_cobrancas_geradas_update ON public.financeiro_cobrancas_geradas FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_config_socio ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_config_socio_delete ON public.financeiro_config_socio FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_config_socio_insert ON public.financeiro_config_socio FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_config_socio_select ON public.financeiro_config_socio FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_config_socio_update ON public.financeiro_config_socio FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_dae ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_dae_delete ON public.financeiro_dae FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_dae_insert ON public.financeiro_dae FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_dae_select ON public.financeiro_dae FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_dae_update ON public.financeiro_dae FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_historico_regime ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_historico_regime_delete ON public.financeiro_historico_regime FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_historico_regime_insert ON public.financeiro_historico_regime FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_historico_regime_select ON public.financeiro_historico_regime FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_historico_regime_update ON public.financeiro_historico_regime FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_lancamentos_delete ON public.financeiro_lancamentos FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_lancamentos_insert ON public.financeiro_lancamentos FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_lancamentos_select ON public.financeiro_lancamentos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_lancamentos_update ON public.financeiro_lancamentos FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

ALTER TABLE public.foto_upload_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY foto_upload_tokens_delete ON public.foto_upload_tokens FOR DELETE USING (((tenant_id IS NOT NULL) AND public.is_tenant_owner(tenant_id)));

CREATE POLICY foto_upload_tokens_insert ON public.foto_upload_tokens FOR INSERT WITH CHECK (((tenant_id IS NOT NULL) AND (public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = foto_upload_tokens.tenant_id) AND (m.is_active = true) AND ((foto_upload_tokens.unit_id IS NULL) OR (m.unit_id = foto_upload_tokens.unit_id))))))));

CREATE POLICY foto_upload_tokens_select ON public.foto_upload_tokens FOR SELECT USING (((tenant_id IS NOT NULL) AND (public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = foto_upload_tokens.tenant_id) AND (m.is_active = true) AND ((foto_upload_tokens.unit_id IS NULL) OR (m.unit_id = foto_upload_tokens.unit_id))))))));

CREATE POLICY foto_upload_tokens_update ON public.foto_upload_tokens FOR UPDATE USING (((tenant_id IS NOT NULL) AND (public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = foto_upload_tokens.tenant_id) AND (m.is_active = true) AND ((foto_upload_tokens.unit_id IS NULL) OR (m.unit_id = foto_upload_tokens.unit_id)))))))) WITH CHECK (((tenant_id IS NOT NULL) AND (public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = foto_upload_tokens.tenant_id) AND (m.is_active = true) AND ((foto_upload_tokens.unit_id IS NULL) OR (m.unit_id = foto_upload_tokens.unit_id))))))));

ALTER TABLE public.localidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY localidades_delete ON public.localidades FOR DELETE TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true))))));

CREATE POLICY localidades_insert ON public.localidades FOR INSERT TO authenticated WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true))))));

CREATE POLICY localidades_select ON public.localidades FOR SELECT TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true))))));

CREATE POLICY localidades_update ON public.localidades FOR UPDATE TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.logs_eventos_requerimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY logs_eventos_requerimento_insert ON public.logs_eventos_requerimento FOR INSERT WITH CHECK (((requerimento_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.requerimentos r
     JOIN public.socios s ON ((s.cpf = r.cpf)))
  WHERE ((r.id = logs_eventos_requerimento.requerimento_id) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))));

CREATE POLICY logs_eventos_requerimento_select ON public.logs_eventos_requerimento FOR SELECT USING (((requerimento_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.requerimentos r
     JOIN public.socios s ON ((s.cpf = r.cpf)))
  WHERE ((r.id = logs_eventos_requerimento.requerimento_id) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))));

ALTER TABLE public.parametros ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.parametros_financeiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY parametros_financeiros_insert ON public.parametros_financeiros FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros_financeiros.tenant_id) AND (m.unit_id = parametros_financeiros.unit_id) AND (m.is_active = true))))));

CREATE POLICY parametros_financeiros_select ON public.parametros_financeiros FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros_financeiros.tenant_id) AND (m.unit_id = parametros_financeiros.unit_id) AND (m.is_active = true))))));

CREATE POLICY parametros_financeiros_update ON public.parametros_financeiros FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros_financeiros.tenant_id) AND (m.unit_id = parametros_financeiros.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros_financeiros.tenant_id) AND (m.unit_id = parametros_financeiros.unit_id) AND (m.is_active = true))))));

CREATE POLICY parametros_insert ON public.parametros FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros.tenant_id) AND (m.unit_id = parametros.unit_id) AND (m.is_active = true))))));

CREATE POLICY parametros_select ON public.parametros FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros.tenant_id) AND (m.unit_id = parametros.unit_id) AND (m.is_active = true))))));

CREATE POLICY parametros_update ON public.parametros FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros.tenant_id) AND (m.unit_id = parametros.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = parametros.tenant_id) AND (m.unit_id = parametros.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.portarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY portarias_delete ON public.portarias FOR DELETE TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = portarias.tenant_id) AND (m.unit_id = portarias.unit_id) AND (m.is_active = true))))));

CREATE POLICY portarias_insert ON public.portarias FOR INSERT TO authenticated WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = portarias.tenant_id) AND (m.unit_id = portarias.unit_id) AND (m.is_active = true))))));

CREATE POLICY portarias_select ON public.portarias FOR SELECT TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = portarias.tenant_id) AND (m.unit_id = portarias.unit_id) AND (m.is_active = true))))));

CREATE POLICY portarias_update ON public.portarias FOR UPDATE TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = portarias.tenant_id) AND (m.unit_id = portarias.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = portarias.tenant_id) AND (m.unit_id = portarias.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.reap ENABLE ROW LEVEL SECURITY;

CREATE POLICY reap_delete ON public.reap FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY reap_insert ON public.reap FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY reap_select ON public.reap FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

CREATE POLICY reap_update ON public.reap FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))));

ALTER TABLE public.requerimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY requerimentos_delete ON public.requerimentos FOR DELETE TO authenticated USING (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))));

CREATE POLICY requerimentos_insert ON public.requerimentos FOR INSERT WITH CHECK (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))));

CREATE POLICY requerimentos_select ON public.requerimentos FOR SELECT USING (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))));

CREATE POLICY requerimentos_update ON public.requerimentos FOR UPDATE USING (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true)))))))))) WITH CHECK (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.tenant_id = s.tenant_id) AND (m.is_active = true))))))))));

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY socios_delete ON public.socios FOR DELETE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.tenant_id = socios.tenant_id) AND (m.is_active = true))))));

CREATE POLICY socios_insert ON public.socios FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.tenant_id = socios.tenant_id) AND (m.is_active = true))))));

CREATE POLICY socios_select ON public.socios FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.tenant_id = socios.tenant_id) AND (m.is_active = true))))));

CREATE POLICY socios_update ON public.socios FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.tenant_id = socios.tenant_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.tenant_id = socios.tenant_id) AND (m.is_active = true))))));

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_delete ON public.templates FOR DELETE TO authenticated USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.tenant_id = templates.tenant_id) AND (tu.user_id = auth.uid()) AND (tu.is_active = true) AND ((tu.tenant_role = 'owner'::text) OR (tu.operator_type = 'presidente'::text)))))));

CREATE POLICY templates_insert ON public.templates FOR INSERT TO authenticated WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.tenant_id = templates.tenant_id) AND (tu.user_id = auth.uid()) AND (tu.is_active = true) AND ((tu.tenant_role = 'owner'::text) OR (tu.operator_type = 'presidente'::text)))))));

CREATE POLICY templates_select ON public.templates FOR SELECT TO authenticated USING (((tenant_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.tenant_users
  WHERE ((tenant_users.tenant_id = templates.tenant_id) AND (tenant_users.user_id = auth.uid()) AND (tenant_users.is_active = true))))));

ALTER TABLE public.tenant_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_units_insert ON public.tenant_units FOR INSERT TO authenticated WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE POLICY tenant_units_select_members ON public.tenant_units FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.tenant_id = tenant_units.tenant_id) AND (m.user_id = auth.uid()) AND (m.unit_id = tenant_units.id) AND (m.is_active = true))))));

CREATE POLICY tenant_units_update ON public.tenant_units FOR UPDATE TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));

ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_users_delete_admins ON public.tenant_users FOR DELETE USING ((public.is_tenant_owner(tenant_id) OR (public.is_tenant_presidente(tenant_id) AND ((EXISTS ( SELECT 1
   FROM (public.user_unit_memberships m1
     JOIN public.user_unit_memberships m2 ON (((m1.unit_id = m2.unit_id) AND (m1.tenant_id = m2.tenant_id))))
  WHERE ((m1.user_id = auth.uid()) AND (m2.user_id = tenant_users.user_id) AND (m1.is_active = true) AND (m2.is_active = true)))) OR (NOT (EXISTS ( SELECT 1
   FROM public.user_unit_memberships
  WHERE ((user_unit_memberships.user_id = tenant_users.user_id) AND (user_unit_memberships.tenant_id = tenant_users.tenant_id) AND (user_unit_memberships.is_active = true)))))))));

CREATE POLICY tenant_users_insert_admins ON public.tenant_users FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR public.is_tenant_presidente(tenant_id)));

CREATE POLICY tenant_users_select_members ON public.tenant_users FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY tenant_users_select_owner ON public.tenant_users FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (public.is_tenant_presidente(tenant_id) AND ((EXISTS ( SELECT 1
   FROM (public.user_unit_memberships m1
     JOIN public.user_unit_memberships m2 ON (((m1.unit_id = m2.unit_id) AND (m1.tenant_id = m2.tenant_id))))
  WHERE ((m1.user_id = auth.uid()) AND (m2.user_id = tenant_users.user_id) AND (m1.is_active = true) AND (m2.is_active = true)))) OR (NOT (EXISTS ( SELECT 1
   FROM public.user_unit_memberships
  WHERE ((user_unit_memberships.user_id = tenant_users.user_id) AND (user_unit_memberships.tenant_id = tenant_users.tenant_id) AND (user_unit_memberships.is_active = true)))))))));

CREATE POLICY tenant_users_update_admins ON public.tenant_users FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (public.is_tenant_presidente(tenant_id) AND ((EXISTS ( SELECT 1
   FROM (public.user_unit_memberships m1
     JOIN public.user_unit_memberships m2 ON (((m1.unit_id = m2.unit_id) AND (m1.tenant_id = m2.tenant_id))))
  WHERE ((m1.user_id = auth.uid()) AND (m2.user_id = tenant_users.user_id) AND (m1.is_active = true) AND (m2.is_active = true)))) OR (NOT (EXISTS ( SELECT 1
   FROM public.user_unit_memberships
  WHERE ((user_unit_memberships.user_id = tenant_users.user_id) AND (user_unit_memberships.tenant_id = tenant_users.tenant_id) AND (user_unit_memberships.is_active = true))))))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR public.is_tenant_presidente(tenant_id)));

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated USING ((public.is_tenant_owner(id) OR (EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.tenant_id = tenants.id) AND (tu.user_id = auth.uid()) AND (tu.is_active = true)))) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.tenant_id = tenants.id) AND (m.user_id = auth.uid()) AND (m.is_active = true))))));

ALTER TABLE public.tipos_cobranca ENABLE ROW LEVEL SECURITY;

CREATE POLICY tipos_cobranca_delete ON public.tipos_cobranca FOR DELETE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = tipos_cobranca.tenant_id) AND (m.unit_id = tipos_cobranca.unit_id) AND (m.is_active = true))))));

CREATE POLICY tipos_cobranca_insert ON public.tipos_cobranca FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = tipos_cobranca.tenant_id) AND (m.unit_id = tipos_cobranca.unit_id) AND (m.is_active = true))))));

CREATE POLICY tipos_cobranca_select ON public.tipos_cobranca FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = tipos_cobranca.tenant_id) AND (m.unit_id = tipos_cobranca.unit_id) AND (m.is_active = true))))));

CREATE POLICY tipos_cobranca_update ON public.tipos_cobranca FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = tipos_cobranca.tenant_id) AND (m.unit_id = tipos_cobranca.unit_id) AND (m.is_active = true)))))) WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = tipos_cobranca.tenant_id) AND (m.unit_id = tipos_cobranca.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_presence_select_tenant ON public.user_presence FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tenant_users tu
  WHERE ((tu.user_id = auth.uid()) AND (tu.is_active = true) AND (tu.tenant_id = user_presence.tenant_id)))));

CREATE POLICY user_presence_write_self ON public.user_presence TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_self ON public.user_profiles FOR SELECT USING (((id = auth.uid()) OR public.is_tenant_owner(( SELECT tenant_users.tenant_id
   FROM public.tenant_users
  WHERE ((tenant_users.user_id = user_profiles.id) AND (tenant_users.is_active = true))
 LIMIT 1)) OR (public.is_tenant_presidente(( SELECT tenant_users.tenant_id
   FROM public.tenant_users
  WHERE ((tenant_users.user_id = user_profiles.id) AND (tenant_users.is_active = true))
 LIMIT 1)) AND ((EXISTS ( SELECT 1
   FROM (public.user_unit_memberships m1
     JOIN public.user_unit_memberships m2 ON (((m1.unit_id = m2.unit_id) AND (m1.tenant_id = m2.tenant_id))))
  WHERE ((m1.user_id = auth.uid()) AND (m2.user_id = user_profiles.id) AND (m1.is_active = true) AND (m2.is_active = true)))) OR (NOT (EXISTS ( SELECT 1
   FROM public.user_unit_memberships
  WHERE ((user_unit_memberships.user_id = user_profiles.id) AND (user_unit_memberships.is_active = true)))))))));

CREATE POLICY user_profiles_update_self ON public.user_profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

ALTER TABLE public.user_unit_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_unit_memberships_delete_owner ON public.user_unit_memberships FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));

CREATE POLICY user_unit_memberships_insert_owner ON public.user_unit_memberships FOR INSERT TO authenticated WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE POLICY user_unit_memberships_select_self ON public.user_unit_memberships FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_tenant_owner(tenant_id)));

CREATE POLICY user_unit_memberships_update_owner ON public.user_unit_memberships FOR UPDATE TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));