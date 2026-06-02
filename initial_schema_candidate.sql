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

CREATE FUNCTION public.cancel_payment_v1(p_id uuid, p_obs text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_socio_cpf text;
    v_lancamento_tipo text;
BEGIN

    IF NOT EXISTS (
        SELECT 1 FROM public.financeiro_lancamentos 
        WHERE id = p_id AND status != 'cancelado'
    ) THEN
        RAISE EXCEPTION 'Lançamento não encontrado ou já cancelado.';
    END IF;

    SELECT socio_cpf, tipo INTO v_socio_cpf, v_lancamento_tipo 
    FROM public.financeiro_lancamentos WHERE id = p_id;

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
        changed_by
    )
    VALUES (
        'financeiro_lancamentos',
        p_id,
        'CANCEL_PAYMENT',
        jsonb_build_object('obs', p_obs, 'socio', v_socio_cpf, 'tipo', v_lancamento_tipo),
        auth.uid()
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
  select tenant_id into v_tenant_id
  from public.tenant_units where id = new.unit_id;

  select max_socios into v_limit
  from public.tenants
  where id = v_tenant_id;

  v_limit := coalesce(v_limit, 0);

  select count(*) into v_count
  from public.socios
  where situacao != 'Excluído' and unit_id = new.unit_id;

  if v_count >= v_limit and (
    tg_op = 'INSERT' or
    (tg_op = 'UPDATE' and old.situacao = 'Excluído' and new.situacao != 'Excluído')
  ) then
    raise exception 'Limite de sócios atingido (%)', v_limit;
  end if;

  return new;
end;
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
BEGIN
  RETURN QUERY
  SELECT s.id, s.nome, s.cpf, s.data_de_nascimento
  FROM public.socios s
  WHERE
    EXTRACT(DAY FROM s.data_de_nascimento) = p_day AND
    EXTRACT(MONTH FROM s.data_de_nascimento) = p_month AND
    (p_unit_id IS NULL OR s.unit_id = p_unit_id)
  ORDER BY s.nome ASC;
END;
$$;

CREATE FUNCTION public.get_finance_audit_log_v1(p_table_name text DEFAULT NULL::text, p_operation text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, table_name text, record_id uuid, operation text, old_data jsonb, new_data jsonb, changed_by uuid, user_nome text, user_email text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
        RAISE EXCEPTION 'Acesso negado: Requer privilégios de administrador.';
    END IF;

    RETURN QUERY
    SELECT
        a.id,
        a.table_name,
        a.record_id,
        a.operation,
        a.old_data,
        a.new_data,
        a.changed_by,
        up.nome as user_nome,
        up.email as user_email,
        a.created_at
    FROM public.audit_log_financeiro a
    LEFT JOIN public.user_profiles up ON up.id = a.changed_by
    WHERE (p_table_name IS NULL OR a.table_name = p_table_name)
      AND (p_operation IS NULL OR a.operation = p_operation)
    ORDER BY a.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

CREATE FUNCTION public.get_finance_tab_counts(p_search_term text DEFAULT ''::text, p_year integer DEFAULT NULL::integer, p_ano_base integer DEFAULT 2024) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
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
  FROM v_situacao_financeira_socio
  WHERE (p_search_term = '' OR nome ILIKE '%' || p_search_term || '%'
         OR cpf ILIKE '%' || p_search_term || '%');

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
    LANGUAGE plpgsql STABLE SECURITY DEFINER
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
  FROM v_situacao_financeira_socio
  WHERE (p_search_term = '' OR nome ILIKE '%' || p_search_term || '%'
         OR cpf ILIKE '%' || p_search_term || '%')
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
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT s.id, s.nome, s.cpf, s.data_de_nascimento, s.codigo_do_socio
        FROM public.socios s
        WHERE EXTRACT(month FROM s.data_de_nascimento) = p_month
    ),
    total AS (
        SELECT count(*) as count FROM filtered
    )
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

CREATE FUNCTION public.get_payments_by_period_paginated(p_start_date date, p_end_date date, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_order_by text DEFAULT 'data_pagamento'::text, p_order_dir text DEFAULT 'DESC'::text) RETURNS TABLE(id uuid, data_pagamento date, tipo text, competencia_ano integer, competencia_mes integer, forma_pagamento text, valor numeric, created_at timestamp with time zone, socio_nome text, socio_cpf text, total_count bigint, total_amount numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT 
            fl.id,
            fl.data_pagamento,
            fl.tipo,
            fl.competencia_ano,
            fl.competencia_mes,
            fl.forma_pagamento,
            fl.valor,
            fl.created_at,
            s.nome as socio_nome,
            s.cpf as socio_cpf
        FROM public.financeiro_lancamentos fl
        JOIN public.socios s ON s.cpf = fl.socio_cpf
        WHERE fl.status = 'pago'
          AND fl.data_pagamento >= p_start_date
          AND fl.data_pagamento <= p_end_date
    ),
    stats AS (
        SELECT count(*) as count, sum(base.valor) as amount FROM base
    )
    SELECT 
        b.id,
        b.data_pagamento,
        b.tipo,
        b.competencia_ano,
        b.competencia_mes,
        b.forma_pagamento,
        b.valor,
        b.created_at,
        b.socio_nome,
        b.socio_cpf, 
        st.count as total_count, 
        st.amount as total_amount
    FROM base b, stats st
    ORDER BY 
        CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'ASC' THEN b.data_pagamento END ASC,
        CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'DESC' THEN b.data_pagamento END DESC,
        CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'ASC' THEN b.created_at END ASC,
        CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'DESC' THEN b.created_at END DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

CREATE FUNCTION public.get_payments_by_period_paginated(p_start_date date, p_end_date date, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_order_by text DEFAULT 'data_pagamento'::text, p_order_dir text DEFAULT 'DESC'::text, p_unit_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, data_pagamento date, tipo text, competencia_ano integer, competencia_mes integer, forma_pagamento text, valor numeric, created_at timestamp with time zone, socio_nome text, socio_cpf text, total_count bigint, total_amount numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT 
            fl.id,
            fl.data_pagamento,
            fl.tipo,
            fl.competencia_ano,
            fl.competencia_mes,
            fl.forma_pagamento,
            fl.valor,
            fl.created_at,
            s.nome as socio_nome,
            s.cpf as socio_cpf
        FROM public.financeiro_lancamentos fl
        JOIN public.socios s ON s.cpf = fl.socio_cpf
        WHERE fl.status = 'pago'
          AND fl.data_pagamento >= p_start_date
          AND fl.data_pagamento <= p_end_date
          AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
    ),
    stats AS (
        SELECT count(*) as count, sum(base.valor) as amount FROM base
    )
    SELECT 
        b.id,
        b.data_pagamento,
        b.tipo,
        b.competencia_ano,
        b.competencia_mes,
        b.forma_pagamento,
        b.valor,
        b.created_at,
        b.socio_nome,
        b.socio_cpf, 
        st.count as total_count, 
        st.amount as total_amount
    FROM base b, stats st
    ORDER BY 
        CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'ASC' THEN b.data_pagamento END ASC,
        CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'DESC' THEN b.data_pagamento END DESC,
        CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'ASC' THEN b.created_at END ASC,
        CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'DESC' THEN b.created_at END DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

CREATE FUNCTION public.get_socio_financial_status(p_cpf text, p_regime text, p_isento boolean, p_liberado boolean) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_current_year int := EXTRACT(year FROM CURRENT_DATE);
    v_current_month int := EXTRACT(month FROM CURRENT_DATE);
BEGIN
    IF p_isento OR p_liberado THEN
        RETURN 'ISENTO';
    END IF;

    IF p_regime = 'anuidade' THEN
        IF EXISTS (
            SELECT 1 FROM public.financeiro_lancamentos 
            WHERE socio_cpf = p_cpf AND tipo = 'anuidade' AND competencia_ano = v_current_year AND status = 'pago'
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
                SELECT 1 FROM public.financeiro_lancamentos 
                WHERE socio_cpf = p_cpf AND tipo = 'mensalidade' 
                  AND competencia_ano = v_current_year AND competencia_mes = m AND status = 'pago'
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
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND tenant_role = 'owner'
      AND is_active = true
  );
$$;

CREATE FUNCTION public.launch_bulk_contribution(p_tipo_cobranca_id uuid, p_unit_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_valor numeric(10,2);
  v_count integer := 0;
BEGIN
  SELECT valor_padrao INTO v_valor
  FROM public.tipos_cobranca
  WHERE id = p_tipo_cobranca_id
    AND categoria = 'contribuicao'
    AND obrigatoriedade = 'compulsoria'
    AND ativo = true;

  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'Tipo de cobrança inválido ou sem valor padrão definido';
  END IF;

  INSERT INTO public.financeiro_cobrancas_geradas (tipo_cobranca_id, socio_cpf, valor)
  SELECT p_tipo_cobranca_id, s.cpf, v_valor
  FROM public.socios s
  WHERE s.situacao = 'ATIVO'
    AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.financeiro_cobrancas_geradas cg
      WHERE cg.tipo_cobranca_id = p_tipo_cobranca_id
        AND cg.socio_cpf = s.cpf
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

CREATE FUNCTION public.list_requirements_extended(p_ano integer, p_status text DEFAULT 'all'::text, p_beneficio text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_carencia text DEFAULT 'all'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10) RETURNS TABLE(id uuid, socio_id uuid, cod_req text, data_assinatura date, cpf text, ano_referencia integer, status_mte text, data_envio date, num_req_mte text, created_at timestamp with time zone, updated_at timestamp with time zone, beneficio_recebido boolean, socio_nome text, socio_nit text, socio_num_rgp text, socio_emissao_rgp date, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_offset integer;
  v_defeso_start date;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_defeso_start := make_date(p_ano, 11, 15); 

  RETURN QUERY
  WITH filtered_data AS (
    SELECT
      r.id as requirement_id,
      s.id as member_id,
      r.cod_req,
      r.data_assinatura,
      s.cpf,
      COALESCE(r.ano_referencia, p_ano) as ano_referencia,
      COALESCE(r.status_mte, 'nao_assinado') as status_mte,
      r.data_envio,
      r.num_req_mte,
      r.created_at,
      r.updated_at,
      COALESCE(r.beneficio_recebido, false) as beneficio_recebido,
      s.nome as socio_nome,
      s.nit as socio_nit,
      s.num_rgp as socio_num_rgp,
      s.emissao_rgp as socio_emissao_rgp
    FROM socios s
    LEFT JOIN requerimentos r ON s.cpf = r.cpf AND r.ano_referencia = p_ano
    WHERE

      (p_status = 'all' OR (CASE WHEN p_status = 'nao_assinado' THEN r.id IS NULL ELSE r.status_mte = p_status END))

      AND (p_beneficio = 'all' OR (CASE WHEN p_beneficio = 'recebido' THEN r.beneficio_recebido IS TRUE ELSE r.beneficio_recebido IS FALSE OR r.beneficio_recebido IS NULL END))

      AND (p_search = '' OR (s.cpf ILIKE '%' || p_search || '%' OR s.nome ILIKE '%' || p_search || '%' OR r.cod_req ILIKE '%' || p_search || '%'))

      AND (
        CASE
          WHEN p_carencia = 'com_carencia' THEN (s.emissao_rgp <= v_defeso_start - INTERVAL '1 year')
          WHEN p_carencia = 'sem_carencia' THEN (s.emissao_rgp > v_defeso_start - INTERVAL '1 year' OR s.emissao_rgp IS NULL)
          ELSE TRUE
        END
      )
  )
  SELECT
    fd.requirement_id, fd.member_id, fd.cod_req, fd.data_assinatura, fd.cpf, fd.ano_referencia,
    fd.status_mte, fd.data_envio, fd.num_req_mte, fd.created_at, fd.updated_at,
    fd.beneficio_recebido, fd.socio_nome, fd.socio_nit, fd.socio_num_rgp, fd.socio_emissao_rgp,
    count(*) OVER() as total_count
  FROM filtered_data fd
  ORDER BY fd.created_at DESC NULLS LAST, fd.socio_nome ASC
  LIMIT p_page_size
  OFFSET v_offset;
END;
$$;

CREATE FUNCTION public.list_requirements_extended(p_ano integer, p_status text DEFAULT 'all'::text, p_beneficio text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_carencia text DEFAULT 'all'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_unit_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, socio_id uuid, cod_req text, data_assinatura date, cpf text, ano_referencia integer, status_mte text, data_envio date, num_req_mte text, created_at timestamp with time zone, updated_at timestamp with time zone, beneficio_recebido boolean, socio_nome text, socio_nit text, socio_num_rgp text, socio_emissao_rgp date, total_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_offset integer;
  v_defeso_start date;
BEGIN
  v_offset := (p_page - 1) * p_page_size;
  v_defeso_start := make_date(p_ano, 11, 15);

  RETURN QUERY
  WITH filtered_data AS (
    SELECT
      r.id as requirement_id,
      s.id as member_id,
      r.cod_req,
      r.data_assinatura,
      s.cpf,
      COALESCE(r.ano_referencia, p_ano) as ano_referencia,
      COALESCE(r.status_mte, 'nao_assinado') as status_mte,
      r.data_envio,
      r.num_req_mte,
      r.created_at,
      r.updated_at,
      COALESCE(r.beneficio_recebido, false) as beneficio_recebido,
      s.nome as socio_nome,
      s.nit as socio_nit,
      s.num_rgp as socio_num_rgp,
      s.emissao_rgp as socio_emissao_rgp
    FROM socios s
    LEFT JOIN requerimentos r ON s.cpf = r.cpf AND r.ano_referencia = p_ano
    WHERE
      (p_unit_id IS NULL OR s.unit_id = p_unit_id)
      AND (p_status = 'all' OR (CASE WHEN p_status = 'nao_assinado' THEN r.id IS NULL ELSE r.status_mte = p_status END))
      AND (p_beneficio = 'all' OR (CASE WHEN p_beneficio = 'recebido' THEN r.beneficio_recebido IS TRUE ELSE r.beneficio_recebido IS FALSE OR r.beneficio_recebido IS NULL END))
      AND (p_search = '' OR (s.cpf ILIKE '%' || p_search || '%' OR s.nome ILIKE '%' || p_search || '%' OR r.cod_req ILIKE '%' || p_search || '%'))
      AND (
        CASE
          WHEN p_carencia = 'com_carencia' THEN (s.emissao_rgp <= v_defeso_start - INTERVAL '1 year')
          WHEN p_carencia = 'sem_carencia' THEN (s.emissao_rgp > v_defeso_start - INTERVAL '1 year' OR s.emissao_rgp IS NULL)
          ELSE TRUE
        END
      )
  )
  SELECT
    fd.requirement_id, fd.member_id, fd.cod_req, fd.data_assinatura, fd.cpf, fd.ano_referencia,
    fd.status_mte, fd.data_envio, fd.num_req_mte, fd.created_at, fd.updated_at,
    fd.beneficio_recebido, fd.socio_nome, fd.socio_nit, fd.socio_num_rgp, fd.socio_emissao_rgp,
    count(*) OVER() as total_count
  FROM filtered_data fd
  ORDER BY fd.created_at DESC NULLS LAST, fd.socio_nome ASC
  LIMIT p_page_size
  OFFSET v_offset;
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
BEGIN
    IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
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

CREATE FUNCTION public.purge_payment_v1(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_old_data jsonb;
BEGIN
    IF (auth.jwt() -> 'app_metadata' ->> 'role') != 'admin' THEN
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
    SET search_path TO 'public'
    AS $$
DECLARE
  entry jsonb;
  v_cpf text;
  v_anual jsonb;
  v_ano text;
  v_ano_data jsonb;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_cpf := entry->>'cpf';
    v_anual := entry->'anual';

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
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    INSERT INTO public.reap (cpf, simplificado, updated_at)
    VALUES (
      entry->>'cpf',
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
    SET search_path TO 'public'
    AS $$
DECLARE
  entry jsonb;
  v_cpf text;
  v_simplificado jsonb;
  v_ano text;
  v_ano_data jsonb;
BEGIN
  FOR entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_cpf := entry->>'cpf';
    v_simplificado := entry->'simplificado';

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
BEGIN
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
BEGIN
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
BEGIN
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
  v_item jsonb;
  v_dae jsonb;
  v_daes_array jsonb := COALESCE(p_daes, '[]'::jsonb);
  v_user_id uuid := auth.uid();
  v_grupo_id uuid := NULL;
BEGIN
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
      p_socio_cpf, p_sessao_id, (v_item->>'tipo'), (v_item->>'valor')::numeric,
      p_forma_pagamento, p_data_pagamento, (v_item->>'competencia_ano')::integer,
      (v_item->>'competencia_mes')::integer,
      CASE WHEN (v_item->>'tipo_cobranca_id') = '' THEN NULL ELSE (v_item->>'tipo_cobranca_id')::uuid END,
      (v_item->>'descricao'), v_user_id
    );

    IF (v_item->>'tipo_cobranca_id') IS NOT NULL AND (v_item->>'tipo_cobranca_id') != '' THEN
      UPDATE public.financeiro_cobrancas_geradas
      SET status = 'pago', lancamento_id = (
        SELECT id FROM public.financeiro_lancamentos
        WHERE sessao_id = p_sessao_id AND tipo_cobranca_id = (v_item->>'tipo_cobranca_id')::uuid
        ORDER BY created_at DESC LIMIT 1
      ), updated_at = now()
      WHERE socio_cpf = p_socio_cpf
        AND tipo_cobranca_id = (v_item->>'tipo_cobranca_id')::uuid
        AND status = 'pendente';
    END IF;
  END LOOP;

  FOR v_dae IN SELECT * FROM jsonb_array_elements(v_daes_array)
  LOOP
    INSERT INTO public.financeiro_dae (
      socio_cpf, sessao_id, tipo_boleto, competencia_ano,
      competencia_mes, valor, forma_pagamento, registrado_por,
      data_recebimento, grupo_id
    ) VALUES (
      p_socio_cpf, p_sessao_id, (v_dae->>'tipo_boleto'),
      (v_dae->>'competencia_ano')::integer, (v_dae->>'competencia_mes')::integer,
      (v_dae->>'valor')::numeric, p_forma_pagamento, v_user_id,
      p_data_pagamento,
      CASE WHEN (v_dae->>'tipo_boleto') = 'unitario' THEN NULL ELSE v_grupo_id END
    );
  END LOOP;
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
  v_membro_base   record;
  v_item          jsonb;
BEGIN
  SELECT socio_cpf, sessao_id, tipo_boleto, forma_pagamento, data_recebimento 
  INTO v_membro_base
  FROM public.financeiro_dae 
  WHERE grupo_id = p_grupo_id 
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grupo não encontrado: %', p_grupo_id;
  END IF;

  UPDATE public.financeiro_dae
  SET status = 'cancelado',
      cancelado_em = now(),
      cancelado_por = auth.uid(),
      cancelamento_obs = 'Correção: Grupo re-emitido devido a edição de valores/competência'
  WHERE grupo_id = p_grupo_id AND status != 'cancelado';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.financeiro_dae (
      socio_cpf, sessao_id, tipo_boleto, competencia_ano, competencia_mes,
      valor, forma_pagamento, boleto_pago, data_pagamento_boleto,
      status, registrado_por, data_recebimento, grupo_id
    )
    VALUES (
      v_membro_base.socio_cpf, v_membro_base.sessao_id, v_membro_base.tipo_boleto,
      p_new_year, (v_item->>'mes')::int, (v_item->>'valor')::numeric,
      v_membro_base.forma_pagamento,
      COALESCE((SELECT boleto_pago FROM public.financeiro_dae WHERE grupo_id = p_grupo_id AND competencia_mes = (v_item->>'mes')::int LIMIT 1), false),
      (SELECT data_pagamento_boleto FROM public.financeiro_dae WHERE grupo_id = p_grupo_id AND competencia_mes = (v_item->>'mes')::int LIMIT 1),
      'pago', auth.uid(), v_membro_base.data_recebimento, v_novo_grupo_id
    );
  END LOOP;
END;
$$;

CREATE FUNCTION public.update_extension_license(p_key text, p_unit_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_unit_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.configuracao_entidade WHERE unit_id IS NOT NULL LIMIT 1) THEN
      RAISE EXCEPTION 'p_unit_id obrigatório: tabela configuracao_entidade está em modo multi-polo';
    END IF;
    UPDATE public.configuracao_entidade
    SET extensao_license_key = p_key, updated_at = now()
    WHERE id = 1;
  ELSE
    UPDATE public.configuracao_entidade
    SET extensao_license_key = p_key, updated_at = now()
    WHERE unit_id = p_unit_id;
  END IF;
END;
$$;

CREATE FUNCTION public.update_member_regime(p_cpf text, p_novo_regime text, p_observacao text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  UPDATE public.financeiro_historico_regime
  SET vigente_ate = CURRENT_DATE
  WHERE socio_cpf = p_cpf AND vigente_ate IS NULL;

  INSERT INTO public.financeiro_historico_regime (socio_cpf, regime, vigente_desde, alterado_por, observacao)
  VALUES (p_cpf, p_novo_regime, CURRENT_DATE, v_user_id, p_observacao);

  INSERT INTO public.financeiro_config_socio (cpf, regime)
  VALUES (p_cpf, p_novo_regime)
  ON CONFLICT (cpf)
  DO UPDATE SET regime = p_novo_regime, updated_at = now();
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
    unit_id uuid
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
    data_pagamento date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_cancelamento_audit_lancamentos CHECK ((((status = 'cancelado'::text) AND (cancelado_por IS NOT NULL)) OR (status <> 'cancelado'::text))),
    CONSTRAINT chk_tipo_cobranca CHECK ((((tipo = ANY (ARRAY['contribuicao'::text, 'cadastro_governamental'::text])) AND (tipo_cobranca_id IS NOT NULL)) OR ((tipo <> ALL (ARRAY['contribuicao'::text, 'cadastro_governamental'::text])) AND (tipo_cobranca_id IS NULL)))),
    CONSTRAINT financeiro_lancamentos_competencia_mes_check CHECK (((competencia_mes >= 1) AND (competencia_mes <= 12))),
    CONSTRAINT financeiro_lancamentos_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'transferencia'::text, 'boleto'::text, 'cartao'::text]))),
    CONSTRAINT financeiro_lancamentos_status_check CHECK ((status = ANY (ARRAY['pago'::text, 'cancelado'::text]))),
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
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.localidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_localidade text,
    nome text,
    tenant_id uuid,
    unit_id uuid
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
    unit_id uuid
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
    unit_id uuid
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.tenant_units IS 'Municipal units or polos that belong to a tenant.';

CREATE TABLE public.tenant_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tenant_role text DEFAULT 'member'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    operator_type text,
    CONSTRAINT tenant_users_operator_type_check CHECK ((((tenant_role = 'owner'::text) AND (operator_type IS NULL)) OR ((tenant_role = 'member'::text) AND ((operator_type IS NULL) OR (operator_type = ANY (ARRAY['presidente'::text, 'auxiliar'::text])))))),
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

COMMENT ON TABLE public.tenants IS 'Shared-first registry of tenants available in the new architecture.';

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

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    email text,
    nome text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.user_profiles IS 'Application profile data synchronized from auth.users for the new shared architecture.';

CREATE TABLE public.user_unit_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.user_unit_memberships IS 'Authorization mapping between authenticated users and the tenant units they may access.';

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

CREATE VIEW public.v_situacao_financeira_socio AS
 WITH base AS (
         SELECT s.cpf,
            s.nome,
            s.unit_id,
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
          GROUP BY s.cpf, s.nome, s.unit_id, s.situacao, cfg.regime, pf.regime_padrao, cfg.isento, cfg.liberado_pelo_presidente
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
    public.get_socio_financial_status(cpf, regime, isento, liberado_presidente) AS situacao_geral,
    meses_pagos_atual
   FROM base;

ALTER TABLE ONLY public.audit_log_financeiro
    ADD CONSTRAINT audit_log_financeiro_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.configuracao_entidade
    ADD CONSTRAINT configuracao_entidade_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.entidade
    ADD CONSTRAINT entidade_pkey PRIMARY KEY (id);

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

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_unit_memberships
    ADD CONSTRAINT user_unit_memberships_pkey PRIMARY KEY (id);

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

CREATE INDEX templates_tenant_id_idx ON public.templates USING btree (tenant_id);

CREATE UNIQUE INDEX tenant_units_tenant_id_id_idx ON public.tenant_units USING btree (tenant_id, id);

CREATE INDEX tenant_units_tenant_id_idx ON public.tenant_units USING btree (tenant_id);

CREATE UNIQUE INDEX uniq_anuidade_por_ano ON public.financeiro_lancamentos USING btree (socio_cpf, competencia_ano) WHERE ((tipo = 'anuidade'::text) AND (status = 'pago'::text));

CREATE UNIQUE INDEX uniq_mensalidade_por_mes ON public.financeiro_lancamentos USING btree (socio_cpf, competencia_ano, competencia_mes) WHERE ((tipo = 'mensalidade'::text) AND (status = 'pago'::text));

CREATE UNIQUE INDEX uniq_tipo_cobranca_por_socio ON public.financeiro_lancamentos USING btree (socio_cpf, tipo_cobranca_id) WHERE ((status = 'pago'::text) AND (tipo_cobranca_id IS NOT NULL));

CREATE INDEX user_unit_memberships_tenant_id_idx ON public.user_unit_memberships USING btree (tenant_id);

CREATE INDEX user_unit_memberships_unit_id_idx ON public.user_unit_memberships USING btree (unit_id) WHERE (unit_id IS NOT NULL);

CREATE INDEX user_unit_memberships_user_id_idx ON public.user_unit_memberships USING btree (user_id);

CREATE TRIGGER set_tenant_users_updated_at BEFORE UPDATE ON public.tenant_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenant_units_set_updated_at BEFORE UPDATE ON public.tenant_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_audit_parametros_financeiros AFTER INSERT OR DELETE OR UPDATE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();

CREATE TRIGGER tr_audit_tipos_cobranca AFTER INSERT OR DELETE OR UPDATE ON public.tipos_cobranca FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();

CREATE TRIGGER tr_check_member_limit BEFORE INSERT ON public.socios FOR EACH ROW EXECUTE FUNCTION public.check_member_limit();

CREATE TRIGGER trg_cobrancas_geradas_upd BEFORE UPDATE ON public.financeiro_cobrancas_geradas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fin_config_socio_upd BEFORE UPDATE ON public.financeiro_config_socio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fin_dae_upd BEFORE UPDATE ON public.financeiro_dae FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fin_lancamentos_upd BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_limpar_tokens_expirados AFTER INSERT ON public.foto_upload_tokens FOR EACH STATEMENT EXECUTE FUNCTION public.limpar_tokens_expirados_trigger();

CREATE TRIGGER trg_parametros_financeiros_upd BEFORE UPDATE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_socios_upd BEFORE UPDATE ON public.socios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
    ADD CONSTRAINT socios_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.tenant_units(id);

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

ALTER TABLE public.financeiro_cobrancas_geradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_cobrancas_geradas_delete ON public.financeiro_cobrancas_geradas FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND public.is_tenant_owner(s.tenant_id)))));

CREATE POLICY financeiro_cobrancas_geradas_insert ON public.financeiro_cobrancas_geradas FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_cobrancas_geradas_select ON public.financeiro_cobrancas_geradas FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_cobrancas_geradas_update ON public.financeiro_cobrancas_geradas FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_cobrancas_geradas.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_config_socio ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_config_socio_delete ON public.financeiro_config_socio FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND public.is_tenant_owner(s.tenant_id)))));

CREATE POLICY financeiro_config_socio_insert ON public.financeiro_config_socio FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_config_socio_select ON public.financeiro_config_socio FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_config_socio_update ON public.financeiro_config_socio FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_config_socio.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_dae ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_dae_delete ON public.financeiro_dae FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND public.is_tenant_owner(s.tenant_id)))));

CREATE POLICY financeiro_dae_insert ON public.financeiro_dae FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_dae_select ON public.financeiro_dae FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_dae_update ON public.financeiro_dae FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_dae.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_historico_regime ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_historico_regime_delete ON public.financeiro_historico_regime FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND public.is_tenant_owner(s.tenant_id)))));

CREATE POLICY financeiro_historico_regime_insert ON public.financeiro_historico_regime FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_historico_regime_select ON public.financeiro_historico_regime FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_historico_regime_update ON public.financeiro_historico_regime FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_historico_regime.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY financeiro_lancamentos_delete ON public.financeiro_lancamentos FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND public.is_tenant_owner(s.tenant_id)))));

CREATE POLICY financeiro_lancamentos_insert ON public.financeiro_lancamentos FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_lancamentos_select ON public.financeiro_lancamentos FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY financeiro_lancamentos_update ON public.financeiro_lancamentos FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = financeiro_lancamentos.socio_cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

ALTER TABLE public.foto_upload_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY foto_upload_tokens_insert ON public.foto_upload_tokens FOR INSERT WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY foto_upload_tokens_select ON public.foto_upload_tokens FOR SELECT USING ((auth.uid() IS NOT NULL));

CREATE POLICY foto_upload_tokens_update ON public.foto_upload_tokens FOR UPDATE USING (((used = false) AND (expires_at > now()))) WITH CHECK (((used = false) AND (expires_at > now())));

ALTER TABLE public.localidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY localidades_delete ON public.localidades FOR DELETE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true))))));

CREATE POLICY localidades_insert ON public.localidades FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true))))));

CREATE POLICY localidades_select ON public.localidades FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.tenant_id = localidades.tenant_id) AND (m.unit_id = localidades.unit_id) AND (m.is_active = true))))));

CREATE POLICY localidades_update ON public.localidades FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
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
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))));

CREATE POLICY logs_eventos_requerimento_select ON public.logs_eventos_requerimento FOR SELECT USING (((requerimento_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.requerimentos r
     JOIN public.socios s ON ((s.cpf = r.cpf)))
  WHERE ((r.id = logs_eventos_requerimento.requerimento_id) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))));

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

ALTER TABLE public.reap ENABLE ROW LEVEL SECURITY;

CREATE POLICY reap_delete ON public.reap FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND public.is_tenant_owner(s.tenant_id)))));

CREATE POLICY reap_insert ON public.reap FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY reap_select ON public.reap FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

CREATE POLICY reap_update ON public.reap FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = reap.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))));

ALTER TABLE public.requerimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY requerimentos_delete ON public.requerimentos FOR DELETE TO authenticated USING (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND public.is_tenant_owner(s.tenant_id))))));

CREATE POLICY requerimentos_insert ON public.requerimentos FOR INSERT WITH CHECK (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))));

CREATE POLICY requerimentos_select ON public.requerimentos FOR SELECT USING (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))));

CREATE POLICY requerimentos_update ON public.requerimentos FOR UPDATE USING (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true)))))))))) WITH CHECK (((cpf IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.socios s
  WHERE ((s.cpf = requerimentos.cpf) AND (public.is_tenant_owner(s.tenant_id) OR (EXISTS ( SELECT 1
           FROM public.user_unit_memberships m
          WHERE ((m.user_id = auth.uid()) AND (m.unit_id = s.unit_id) AND (m.is_active = true))))))))));

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY socios_delete ON public.socios FOR DELETE USING (public.is_tenant_owner(tenant_id));

CREATE POLICY socios_insert ON public.socios FOR INSERT WITH CHECK ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.is_active = true))))));

CREATE POLICY socios_select ON public.socios FOR SELECT USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.is_active = true))))));

CREATE POLICY socios_update ON public.socios FOR UPDATE USING ((public.is_tenant_owner(tenant_id) OR (EXISTS ( SELECT 1
   FROM public.user_unit_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.unit_id = socios.unit_id) AND (m.is_active = true))))));

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_delete ON public.templates FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));

CREATE POLICY templates_insert ON public.templates FOR INSERT TO authenticated WITH CHECK (public.is_tenant_owner(tenant_id));

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

CREATE POLICY tenant_users_delete_admins ON public.tenant_users FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));

CREATE POLICY tenant_users_insert_admins ON public.tenant_users FOR INSERT TO authenticated WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE POLICY tenant_users_select_members ON public.tenant_users FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY tenant_users_update_admins ON public.tenant_users FOR UPDATE TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenants.id
      AND tu.user_id = auth.uid()
      AND tu.is_active = true
  )
);

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

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_select_self ON public.user_profiles FOR SELECT USING (((id = auth.uid()) OR public.is_tenant_owner(( SELECT tenant_users.tenant_id
   FROM public.tenant_users
  WHERE ((tenant_users.user_id = user_profiles.id) AND (tenant_users.is_active = true))
 LIMIT 1))));

CREATE POLICY user_profiles_update_self ON public.user_profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

ALTER TABLE public.user_unit_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_unit_memberships_delete_owner ON public.user_unit_memberships FOR DELETE TO authenticated USING (public.is_tenant_owner(tenant_id));

CREATE POLICY user_unit_memberships_insert_owner ON public.user_unit_memberships FOR INSERT TO authenticated WITH CHECK (public.is_tenant_owner(tenant_id));

CREATE POLICY user_unit_memberships_select_self ON public.user_unit_memberships FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_tenant_owner(tenant_id)));

CREATE POLICY user_unit_memberships_update_owner ON public.user_unit_memberships FOR UPDATE TO authenticated USING (public.is_tenant_owner(tenant_id)) WITH CHECK (public.is_tenant_owner(tenant_id));