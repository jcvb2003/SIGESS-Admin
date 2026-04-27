export const initialSchemaSql = String.raw`
--
-- PostgreSQL database dump
--

-- Dumped from database version 15.1
-- Dumped by pg_dump version 15.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS auth;


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS extensions;


--
-- Name: pg_cron; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS pg_cron;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS realtime;


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS storage;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS supabase_migrations;


--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA extensions;


--
-- Name: pg_net; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: pgjwt; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;


--
-- Name: pgsql-http; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgsql-http" WITH SCHEMA extensions;


--
-- Name: pgtrgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgtrgm WITH SCHEMA public;


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: aal_level; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.aal_level AS ENUM (
    'aal1',
    'aal2',
    'aal3'
);


--
-- Name: code_challenge_method; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.code_challenge_method AS ENUM (
    's256',
    'plain'
);


--
-- Name: factor_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_status AS ENUM (
    'unverified',
    'verified'
);


--
-- Name: factor_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.factor_type AS ENUM (
    'totp',
    'webauthn',
    'phone'
);


--
-- Name: one_time_token_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.one_time_token_type AS ENUM (
    'confirmation_token',
    'reauthentication_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
);


--
-- Name: action; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.action AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'ERROR'
);


--
-- Name: equality_op; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.equality_op AS ENUM (
    'eq',
    'neq',
    'lt',
    'lte',
    'gt',
    'gte',
    'in'
);


--
-- Name: user_defined_filter; Type: TYPE; Schema: realtime; Owner: -
--

CREATE TYPE realtime.user_defined_filter AS (
	column_name text,
	op realtime.equality_op,
	value text
);


--
-- Name: buckettype; Type: TYPE; Schema: storage; Owner: -
--

CREATE TYPE storage.buckettype AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


--
-- Name: oauth_authorization_status; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_authorization_status AS ENUM (
    'pending',
    'approved',
    'denied'
);


--
-- Name: oauth_client_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_client_type AS ENUM (
    'public',
    'confidential'
);


--
-- Name: oauth_response_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_response_type AS ENUM (
    'code',
    'token',
    'id_token'
);


--
-- Name: oauth_registration_type; Type: TYPE; Schema: auth; Owner: -
--

CREATE TYPE auth.oauth_registration_type AS ENUM (
    'automatic',
    'manual'
);


--
-- Name: apply_rls(text, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.apply_rls(wal jsonb, max_record_size integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
      declare
        -- "user" are reserved words in postgreSQL
        user_uuid uuid := realtime.get_user_uuid();
        user_role regrole := realtime.get_user_role();

        -- we need to check if the user is a superuser
        -- if so, we can skip RLS
        is_superuser boolean := (
          select rolsuper
          from pg_roles
          where rolname = user_role::text
        );

        -- the table name
        table_name text := wal ->> 'table';
        -- the schema name
        schema_name text := wal ->> 'schema';
        -- the table oid
        table_oid oid := (select (schema_name || '.' || table_name)::regclass::oid);

        -- we need to check if the table has RLS enabled
        is_rls_enabled boolean := (
          select relrowsecurity
          from pg_class
          where oid = table_oid
        );

        -- the action (INSERT, UPDATE, DELETE)
        action_name text := wal ->> 'action';

        -- the record
        record jsonb := (wal -> 'record');
        -- the old record
        old_record jsonb := (wal -> 'old_record');

        -- the filtered record
        filtered_record jsonb;
        -- the filtered old record
        filtered_old_record jsonb;

        -- columns
        columns_info jsonb := (wal -> 'columns');

        -- if RLS is enabled, we need to check if the user has access to the record
        -- for the given action
        can_access_record boolean := false;
        can_access_old_record boolean := false;
      begin
        if is_superuser or not is_rls_enabled then
          return wal;
        end if;

        -- we need to check if the user has access to the record
        -- for the given action
        if action_name = 'INSERT' or action_name = 'UPDATE' then
          can_access_record := (
            select (
              -- we need to use the check_rls function to check if the user
              -- has access to the record
              -- the check_rls function will return a boolean
              -- we need to pass the table name, the record and the action
              realtime.check_rls(table_oid, record, action_name)
            )
          );
        end if;

        if action_name = 'UPDATE' or action_name = 'DELETE' then
          can_access_old_record := (
            select (
              -- we need to use the check_rls function to check if the user
              -- has access to the record
              -- the check_rls function will return a boolean
              -- we need to pass the table name, the record and the action
              realtime.check_rls(table_oid, old_record, action_name)
            )
          );
        end if;

        -- if the user has access to the record, we need to filter the record
        -- based on the columns the user has access to
        if can_access_record then
          filtered_record := (
            select (
              -- we need to use the filter_record function to filter the record
              -- based on the columns the user has access to
              -- the filter_record function will return a jsonb
              -- we need to pass the table name and the record
              realtime.filter_record(table_oid, record)
            )
          );
        end if;

        if can_access_old_record then
          filtered_old_record := (
            select (
              -- we need to use the filter_record function to filter the record
              -- based on the columns the user has access to
              -- the filter_record function will return a jsonb
              -- we need to pass the table name and the record
              realtime.filter_record(table_oid, old_record)
            )
          );
        end if;

        -- if the record or old record is too large, we need to truncate it
        -- if the record is too large, we need to truncate it
        if filtered_record is not null and octet_length(filtered_record::text) > max_record_size then
          filtered_record := jsonb_build_object('error', 'record_too_large');
        end if;

        -- if the old record is too large, we need to truncate it
        if filtered_old_record is not null and octet_length(filtered_old_record::text) > max_record_size then
          filtered_old_record := jsonb_build_object('error', 'record_too_large');
        end if;

        -- we need to update the wal with the filtered record and old record
        wal := wal || jsonb_build_object('record', filtered_record, 'old_record', filtered_old_record);

        return wal;
      end;
    $$;


--
-- Name: check_rls(oid, jsonb, text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.check_rls(table_oid oid, record jsonb, action_name text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
      declare
        -- the query to check if the user has access to the record
        rls_query text;
        -- the result of the query
        rls_result boolean;
        -- column names
        column_names text[];
        -- column values
        column_values text[];
      begin
        -- we need to get the column names and values from the record
        select array_agg(key), array_agg(value)
        into column_names, column_values
        from jsonb_each_text(record);

        -- we need to build the query to check if the user has access to the record
        -- the query will be:
        -- select exists (
        --   select 1
        --   from table_name
        --   where column1 = value1 and column2 = value2 ...
        -- )
        rls_query := format(
          'select exists (select 1 from %s where %s)',
          table_oid::regclass,
          (
            select string_agg(format('%I = %L', name, value), ' and ')
            from unnest(column_names, column_values) as t(name, value)
          )
        );

        -- we need to execute the query and get the result
        execute rls_query into rls_result;

        return rls_result;
      exception
        when others then
          return false;
      end;
    $$;


--
-- Name: filter_record(oid, jsonb); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.filter_record(table_oid oid, record jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
      declare
        -- the user role
        user_role regrole := realtime.get_user_role();
        -- the filtered record
        filtered_record jsonb;
      begin
        -- we need to filter the record based on the columns the user has access to
        -- the user has access to the columns if the user has SELECT permission
        -- on the column
        filtered_record := (
          select jsonb_object_agg(key, value)
          from jsonb_each(record)
          where has_column_privilege(user_role, table_oid, key, 'SELECT')
        );

        return filtered_record;
      end;
    $$;


--
-- Name: get_user_role(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.get_user_role() RETURNS regrole
    LANGUAGE plpgsql
    AS $$
      declare
        user_role regrole;
      begin
        -- we need to get the user role from the session
        -- the user role is stored in the 'role' claim of the JWT
        user_role := (select auth.role())::regrole;

        return user_role;
      exception
        when others then
          return 'anon'::regrole;
      end;
    $$;


--
-- Name: get_user_uuid(); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.get_user_uuid() RETURNS uuid
    LANGUAGE plpgsql
    AS $$
      declare
        user_uuid uuid;
      begin
        -- we need to get the user uuid from the session
        -- the user uuid is stored in the 'sub' claim of the JWT
        user_uuid := (select auth.uid())::uuid;

        return user_uuid;
      exception
        when others then
          return null;
      end;
    $$;


--
-- Name: to_regrole(text); Type: FUNCTION; Schema: realtime; Owner: -
--

CREATE FUNCTION realtime.to_regrole(role_name text) RETURNS regrole
    LANGUAGE plpgsql
    AS $$
      declare
        role_regrole regrole;
      begin
        role_regrole := role_name::regrole;
        return role_regrole;
      exception
        when others then
          return 'anon'::regrole;
      end;
    $$;


--
-- Name: auto_generate_cod_req(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_generate_cod_req() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    entity_prefix TEXT;
    next_num INT;
BEGIN
    -- Obter o nome abreviado da entidade (Oeiras no caso)
    SELECT LOWER(nome_abreviado) INTO entity_prefix FROM public.entidade LIMIT 1;
    
    -- Se no houver prefixo, usar default
    IF entity_prefix IS NULL THEN
        entity_prefix := 'req';
    END IF;

    -- Obter o prximo nmero sequencial para o ano corrente
    SELECT COALESCE(MAX(CAST(SUBSTRING(cod_req FROM '[0-9]+$') AS INT)), 0) + 1
    INTO next_num
    FROM public.requerimentos
    WHERE cod_req LIKE entity_prefix || '-' || NEW.ano_referencia || '-%';

    -- Formatar o novo cdigo
    NEW.cod_req := entity_prefix || '-' || NEW.ano_referencia || '-' || LPAD(next_num::TEXT, 4, '0');

    RETURN NEW;
END;
$$;


--
-- Name: check_member_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_member_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_current_count integer;
    v_max_allowed integer;
BEGIN
    -- Conta scios ativos
    SELECT count(*) INTO v_current_count FROM public.socios;
    
    -- Pega limite configurado
    SELECT max_socios INTO v_max_allowed FROM public.configuracao_entidade LIMIT 1;
    
    IF v_current_count >= v_max_allowed THEN
        RAISE EXCEPTION 'Limite de scios atingido (%) para este plano.', v_max_allowed;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: generate_next_codigo_localidade(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_next_codigo_localidade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    max_code TEXT;
    next_code_int INT;
BEGIN
    -- Pegar o maior cdigo numrico atual
    SELECT MAX(codigo_localidade) INTO max_code FROM public.localidades;
    
    IF max_code IS NULL THEN
        next_code_int := 1;
    ELSE
        next_code_int := CAST(max_code AS INT) + 1;
    END IF;
    
    -- Formata com zeros  esquerda (ex: 001, 002)
    NEW.codigo_localidade := LPAD(next_code_int::TEXT, 3, '0');
    
    RETURN NEW;
END;
$$;


--
-- Name: get_payments_by_period_paginated(date, date, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_payments_by_period_paginated(p_start_date date, p_end_date date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10) RETURNS TABLE(id uuid, socio_cpf text, socio_nome text, tipo text, competencia_ano integer, competencia_mes integer, valor numeric, forma_pagamento text, data_pagamento date, total_count bigint, total_amount numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_offset INT := (p_page - 1) * p_page_size;
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT 
            fl.id,
            fl.socio_cpf,
            s.nome as socio_nome,
            fl.tipo,
            fl.competencia_ano,
            fl.competencia_mes,
            fl.valor,
            fl.forma_pagamento,
            fl.data_pagamento
        FROM public.financeiro_lancamentos fl
        JOIN public.socios s ON fl.socio_cpf = s.cpf
        WHERE fl.data_pagamento BETWEEN p_start_date AND p_end_date
          AND fl.status = 'pago'
    ),
    stats AS (
        SELECT count(*) as count, sum(base.valor) as amount FROM base
    )
    SELECT 
        base.id,
        base.socio_cpf,
        base.socio_nome,
        base.tipo,
        base.competencia_ano,
        base.competencia_mes,
        base.valor,
        base.forma_pagamento,
        base.data_pagamento,
        stats.count as total_count,
        stats.amount as total_amount
    FROM base, stats
    ORDER BY base.data_pagamento DESC, base.id
    LIMIT p_page_size
    OFFSET v_offset;
END;
$$;


--
-- Name: get_socio_financial_status(text, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_socio_financial_status(p_cpf text, p_regime text, p_isento boolean DEFAULT false, p_liberado boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_ano_atual INT := EXTRACT(year FROM CURRENT_DATE);
    v_mes_atual INT := EXTRACT(month FROM CURRENT_DATE);
    v_pendente BOOLEAN;
BEGIN
    -- 1. Prioridade mxima: Iseno ou Liberao Manual
    IF p_isento OR p_liberado THEN
        RETURN 'em_dia';
    END IF;

    -- 2. Lgica por Regime
    IF p_regime = 'anuidade' THEN
        -- Verifica se a anuidade do ano atual est paga
        SELECT NOT EXISTS (
            SELECT 1 FROM public.financeiro_lancamentos 
            WHERE socio_cpf = p_cpf 
            AND tipo = 'anuidade' 
            AND competencia_ano = v_ano_atual
            AND status = 'pago'
        ) INTO v_pendente;
        
        RETURN CASE WHEN v_pendente THEN 'atrasado' ELSE 'em_dia' END;
    
    ELSIF p_regime = 'mensalidade' THEN
        -- Verifica se o ms atual (ou anterior) est pago
        -- Simplificado: se deve mais de 2 meses, est atrasado
        SELECT (
            SELECT COUNT(*) 
            FROM (
                SELECT generate_series(1, v_mes_atual) as mes
            ) s
            WHERE NOT EXISTS (
                SELECT 1 FROM public.financeiro_lancamentos 
                WHERE socio_cpf = p_cpf 
                AND tipo = 'mensalidade' 
                AND competencia_ano = v_ano_atual
                AND competencia_mes = s.mes
                AND status = 'pago'
            )
        ) > 2 INTO v_pendente;

        RETURN CASE WHEN v_pendente THEN 'atrasado' ELSE 'em_dia' END;
    END IF;

    RETURN 'atrasado';
END;
$$;


--
-- Name: handle_delete_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_delete_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Remove da tabela public.User quando o registro  deletado do auth.users
  DELETE FROM public."User" WHERE id = OLD.id;
  RETURN OLD;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public."User" (id, email, nome, role)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'role', 'user')
  );
  RETURN new;
END;
$$;


--
-- Name: handle_update_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_update_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public."User"
  SET email = NEW.email,
      nome = COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', nome)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;


--
-- Name: proc_audit_finance_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proc_audit_finance_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO public.audit_log_financeiro(table_name, record_id, operation, old_data, new_data, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO public.audit_log_financeiro(table_name, record_id, operation, new_data, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_log_financeiro(table_name, record_id, operation, old_data, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: email(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select 
  		coalesce(
  			nullif(current_setting('request.jwt.claim.email', true), ''),
  			(current_setting('request.jwt.claims', true)::jsonb ->> 'email')
  		)::text
$$;


--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
_static_extensions text[];
BEGIN
    _static_extensions := ARRAY['tar.gz', 'tar.bz2', 'tar.xz'];
    _parts := split_part(name, '.', 2);

    IF _parts IS NULL THEN
        RETURN '';
    END IF;

    FOR i IN 1..array_upper(_static_extensions, 1) LOOP
        IF name ILIKE '%.' || _static_extensions[i] THEN
            RETURN _static_extensions[i];
        END IF;
    END LOOP;

    RETURN reverse(split_part(reverse(name), '.', 1));
END
$$;


--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	_parts := split_part(name, '/', 2);
	IF _parts IS NULL THEN
		RETURN name;
	END IF;
	RETURN reverse(split_part(reverse(name), '/', 1));
END
$$;


--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
	_parts := string_to_array(name, '/');
	IF array_length(_parts, 1) <= 1 THEN
		RETURN '{}';
	END IF;
	RETURN _parts[1:array_length(_parts, 1)-1];
END
$$;


--
-- Name: get_common_prefix(text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_common_prefix(name text, prefix text, delimiter text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    v_common_prefix text;
    v_prefix_len int;
BEGIN
    v_prefix_len := length(prefix);
    -- Check if the name starts with the prefix and contains the delimiter after the prefix
    IF left(name, v_prefix_len) = prefix AND position(delimiter in substring(name from v_prefix_len + 1)) > 0 THEN
        v_common_prefix := substring(name from 1 for v_prefix_len + position(delimiter in substring(name from v_prefix_len + 1)));
        RETURN v_common_prefix;
    ELSE
        RETURN NULL;
    END IF;
END;
$$;


--
-- Name: get_size_by_bucket(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.get_size_by_bucket() RETURNS TABLE(size bigint, bucket_id text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
        select sum(size) as size, bucket_id
        from "storage"."objects"
        group by bucket_id;
END
$$;


--
-- Name: list_objects_with_delimiter(text, text, text, integer, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.list_objects_with_delimiter(bucketname text, prefix text, delimiter text, limits integer DEFAULT 100, offsets integer DEFAULT 0, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_batch_query text;
    v_is_asc boolean;
    v_next_seek text;
    v_count int := 0;
    v_skipped int := 0;
    v_current record;
    v_file_batch_size int := 100;
    v_common_prefix text;
    v_prefix_lower text;
    v_upper_bound text;
BEGIN
    v_is_asc := lower(sort_order) = 'asc';
    v_prefix_lower := lower(prefix);

    -- Precompute upper bound for prefix (one past prefix)
    IF v_is_asc THEN
        v_upper_bound := lower(left(prefix, -1)) || chr(ascii(right(prefix, 1)) + 1);
    END IF;

    -- Build the batch query for files
    v_batch_query := format($sql$
        SELECT name, id, updated_at, created_at, last_accessed_at, metadata
        FROM storage.objects
        WHERE bucket_id = $1
          AND lower(name) %s $2
          AND lower(name) %s $3
        ORDER BY lower(name) %s
        LIMIT $4
    $sql$,
        CASE WHEN v_is_asc THEN '>' ELSE '<' END,
        CASE WHEN v_is_asc THEN '<' ELSE '>=' END,
        sort_order
    );

    v_next_seek := lower(start_after);
    IF v_next_seek = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix_lower;
        ELSE
            -- For DESC, start at the upper bound of the prefix
            v_next_seek := v_prefix_lower || chr(255);
        END IF;
    END IF;

    LOOP
        EXIT WHEN v_count >= v_limit;

        -- PEEK at the next item to determine if it's a file or folder
        EXECUTE format($sql$
            SELECT name
            FROM storage.objects
            WHERE bucket_id = $1
              AND lower(name) %s $2
              AND lower(name) %s $3
            ORDER BY lower(name) %s
            LIMIT 1
        $sql$,
            CASE WHEN v_is_asc THEN '>' ELSE '<' END,
            CASE WHEN v_is_asc THEN '<' ELSE '>=' END,
            sort_order
        ) INTO v_current USING bucketname, v_next_seek,
            CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END;

        EXIT WHEN v_current IS NULL;

        v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and seek past folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(v_common_prefix, v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


--
-- Name: search_by_timestamp(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


--
-- Name: search_v2(text, text, integer, integer, text, text, text, text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text) RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);


--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: custom_oauth_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (((authorization_url IS NULL) OR (authorization_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (((authorization_url IS NULL) OR (char_length(authorization_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_client_id_length CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 512))),
    CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (((discovery_url IS NULL) OR (char_length(discovery_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_identifier_format CHECK ((identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text)),
    CONSTRAINT custom_oauth_providers_issuer_length CHECK (((issuer IS NULL) OR ((char_length(issuer) >= 1) AND (char_length(issuer) <= 2048)))),
    CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (((jwks_uri IS NULL) OR (jwks_uri ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (((jwks_uri IS NULL) OR (char_length(jwks_uri) <= 2048))),
    CONSTRAINT custom_oauth_providers_name_length CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (((provider_type <> 'oauth2'::text) OR ((authorization_url IS NOT NULL) AND (token_url IS NOT NULL) AND (userinfo_url IS NOT NULL)))),
    CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (((provider_type <> 'oidc'::text) OR (discovery_url IS NULL) OR (discovery_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NULL) OR (issuer ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (((provider_type <> 'oidc'::text) OR (issuer IS NOT NULL))),
    CONSTRAINT custom_oauth_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]))),
    CONSTRAINT custom_oauth_providers_token_url_https CHECK (((token_url IS NULL) OR (token_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_token_url_length CHECK (((token_url IS NULL) OR (char_length(token_url) <= 2048))),
    CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (((userinfo_url IS NULL) OR (userinfo_url ~~ 'https://%'::text))),
    CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (((userinfo_url IS NULL) OR (char_length(userinfo_url) <= 2048)))
);


--
-- Name: flow_state; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE flow_state; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE identities; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';


--
-- Name: COLUMN identities.email; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: mfa_amr_claims; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);


--
-- Name: TABLE mfa_amr_claims; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';


--
-- Name: mfa_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);


--
-- Name: TABLE mfa_challenges; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';


--
-- Name: mfa_factors; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);


--
-- Name: TABLE mfa_factors; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';


--
-- Name: COLUMN mfa_factors.last_webauthn_challenge_data; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';


--
-- Name: oauth_authorizations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text,
    CONSTRAINT oauth_authorizations_authorization_code_length CHECK ((char_length(authorization_code) <= 255)),
    CONSTRAINT oauth_authorizations_code_challenge_length CHECK ((char_length(code_challenge) <= 128)),
    CONSTRAINT oauth_authorizations_expires_at_future CHECK ((expires_at > created_at)),
    CONSTRAINT oauth_authorizations_nonce_length CHECK ((char_length(nonce) <= 255)),
    CONSTRAINT oauth_authorizations_redirect_uri_length CHECK ((char_length(redirect_uri) <= 2048)),
    CONSTRAINT oauth_authorizations_resource_length CHECK ((char_length(resource) <= 2048)),
    CONSTRAINT oauth_authorizations_scope_length CHECK ((char_length(scope) <= 4096)),
    CONSTRAINT oauth_authorizations_state_length CHECK ((char_length(state) <= 4096))
);


--
-- Name: oauth_client_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE oauth_client_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';


--
-- Name: oauth_clients; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL,
    CONSTRAINT oauth_clients_client_name_length CHECK ((char_length(client_name) <= 1024)),
    CONSTRAINT oauth_clients_client_uri_length CHECK ((char_length(client_uri) <= 2048)),
    CONSTRAINT oauth_clients_logo_uri_length CHECK ((char_length(logo_uri) <= 2048)),
    CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK ((token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text])))
);


--
-- Name: oauth_consents; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT oauth_consents_revoked_after_granted CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT oauth_consents_scopes_length CHECK ((char_length(scopes) <= 2048)),
    CONSTRAINT oauth_consents_scopes_not_empty CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))
);


--
-- Name: one_time_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT one_time_tokens_token_hash_check CHECK ((char_length(token_hash) > 0))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);


--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: saml_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text,
    CONSTRAINT "entity_id not empty" CHECK ((char_length(entity_id) > 0)),
    CONSTRAINT "metadata_url not empty" CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0))),
    CONSTRAINT "metadata_xml not empty" CHECK ((char_length(metadata_xml) > 0))
);


--
-- Name: TABLE saml_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';


--
-- Name: saml_relay_states; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid,
    CONSTRAINT "request_id not empty" CHECK ((char_length(request_id) > 0))
);


--
-- Name: TABLE saml_relay_states; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text,
    CONSTRAINT sessions_scopes_length CHECK ((char_length(scopes) <= 4096))
);


--
-- Name: TABLE sessions; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';


--
-- Name: COLUMN sessions.not_after; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';


--
-- Name: COLUMN sessions.refresh_token_hmac_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';


--
-- Name: COLUMN sessions.refresh_token_counter; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';


--
-- Name: sso_domains; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT "domain not empty" CHECK ((char_length(domain) > 0))
);


--
-- Name: TABLE sso_domains; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';


--
-- Name: sso_providers; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean,
    CONSTRAINT "resource_id not empty" CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))
);


--
-- Name: TABLE sso_providers; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';


--
-- Name: COLUMN sso_providers.resource_id; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL,
    CONSTRAINT users_email_change_confirm_status_check CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: COLUMN users.is_sso_user; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';


--
-- Name: webauthn_challenges; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT webauthn_challenges_challenge_type_check CHECK ((challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text])))
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id uuid NOT NULL,
    email text,
    "createdAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    role text DEFAULT 'user'::text,
    nome text,
    ativo boolean DEFAULT true NOT NULL
);


--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log_financeiro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_financeiro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    operation text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: configuracao_entidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracao_entidade (
    id integer DEFAULT 1 NOT NULL,
    max_socios integer DEFAULT 100,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    acesso_expira_em timestamp with time zone,
    extensao_license_key text,
    cor_primaria text DEFAULT '160 84% 39%'::text NOT NULL,
    cor_secundaria text DEFAULT '152 69% 41%'::text NOT NULL,
    cor_sidebar text DEFAULT '160 84% 39%'::text NOT NULL,
    logo_path text,
    CONSTRAINT single_row CHECK ((id = 1))
);


--
-- Name: COLUMN configuracao_entidade.acesso_expira_em; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.configuracao_entidade.acesso_expira_em IS 'Data de expirao da licena do sindicato (centralizada)';


--
-- Name: COLUMN configuracao_entidade.extensao_license_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.configuracao_entidade.extensao_license_key IS 'Chave de licena da Extenso SIGESS vinculada a esta entidade';


--
-- Name: entidade; Type: TABLE; Schema: public; Owner: -
--

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
    cpf_do_presidente text
);


--
-- Name: financeiro_cobrancas_geradas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_cobrancas_geradas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo_cobranca_id uuid,
    socio_cpf text,
    valor numeric,
    data_lancamento date DEFAULT CURRENT_DATE,
    data_vencimento date,
    lancamento_id uuid,
    status text DEFAULT 'pendente'::text,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_cancelamento_audit_cobrancas CHECK ((((status = 'cancelado'::text) AND (cancelado_por IS NOT NULL)) OR (status <> 'cancelado'::text))),
    CONSTRAINT financeiro_cobrancas_geradas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'pago'::text, 'cancelado'::text])))
);


--
-- Name: financeiro_config_socio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_config_socio (
    cpf text NOT NULL,
    regime text,
    referencia_vencimento text,
    dia_vencimento integer,
    isento boolean DEFAULT false,
    motivo_isencao text,
    liberado_pelo_presidente boolean DEFAULT false,
    liberacao_observacao text,
    liberacao_data timestamp with time zone,
    liberacao_usuario_id uuid,
    socio_historico boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT financeiro_config_socio_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28))),
    CONSTRAINT financeiro_config_socio_referencia_vencimento_check CHECK ((referencia_vencimento = ANY (ARRAY['dia_fixo'::text, 'admissao'::text, 'rgp'::text]))),
    CONSTRAINT financeiro_config_socio_regime_check CHECK ((regime = ANY (ARRAY['anuidade'::text, 'mensalidade'::text])))
);


--
-- Name: financeiro_dae; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_dae (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text,
    tipo_boleto text,
    competencia_ano integer,
    competencia_mes integer,
    grupo_id uuid,
    sessao_id uuid,
    valor numeric,
    forma_pagamento text,
    boleto_pago boolean DEFAULT false,
    data_pagamento_boleto date,
    status text DEFAULT 'pago'::text,
    registrado_por uuid,
    data_recebimento date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    CONSTRAINT chk_cancelamento_audit_dae CHECK ((((status = 'cancelado'::text) AND (cancelado_por IS NOT NULL)) OR (status <> 'cancelado'::text))),
    CONSTRAINT financeiro_dae_competencia_mes_check CHECK (((competencia_mes >= 1) AND (competencia_mes <= 12))),
    CONSTRAINT financeiro_dae_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'transferencia'::text, 'boleto'::text, 'cartao'::text]))),
    CONSTRAINT financeiro_dae_status_check CHECK ((status = ANY (ARRAY['pago'::text, 'cancelado'::text]))),
    CONSTRAINT financeiro_dae_tipo_boleto_check CHECK ((tipo_boleto = ANY (ARRAY['unitario'::text, 'agrupado'::text, 'anual'::text])))
);


--
-- Name: financeiro_historico_regime; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_historico_regime (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text,
    regime text,
    vigente_desde date,
    vigente_ate date,
    alterado_por uuid,
    observacao text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT financeiro_historico_regime_regime_check CHECK ((regime = ANY (ARRAY['anuidade'::text, 'mensalidade'::text])))
);


--
-- Name: financeiro_lancamentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financeiro_lancamentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text,
    sessao_id uuid DEFAULT gen_random_uuid(),
    tipo text,
    tipo_cobranca_id uuid,
    competencia_ano integer,
    competencia_mes integer,
    valor numeric,
    forma_pagamento text,
    descricao text,
    status text DEFAULT 'pago'::text,
    cancelado_em timestamp with time zone,
    cancelado_por uuid,
    cancelamento_obs text,
    registrado_por uuid,
    data_pagamento date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_cancelamento_audit_lancamentos CHECK ((((status = 'cancelado'::text) AND (cancelado_por IS NOT NULL)) OR (status <> 'cancelado'::text))),
    CONSTRAINT financeiro_lancamentos_competencia_mes_check CHECK (((competencia_mes >= 1) AND (competencia_mes <= 12))),
    CONSTRAINT financeiro_lancamentos_forma_pagamento_check CHECK ((forma_pagamento = ANY (ARRAY['dinheiro'::text, 'pix'::text, 'transferencia'::text, 'boleto'::text, 'cartao'::text]))),
    CONSTRAINT financeiro_lancamentos_status_check CHECK ((status = ANY (ARRAY['pago'::text, 'cancelado'::text]))),
    CONSTRAINT financeiro_lancamentos_tipo_check CHECK ((tipo = ANY (ARRAY['anuidade'::text, 'mensalidade'::text, 'inicial'::text, 'transferencia'::text, 'contribuicao'::text, 'cadastro_governamental'::text])))
);


--
-- Name: foto_upload_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foto_upload_tokens (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    socio_cpf text,
    foto_base64 text,
    foto_url text,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval),
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.foto_upload_tokens REPLICA IDENTITY FULL;


--
-- Name: localidades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.localidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo_localidade text,
    nome text
);


--
-- Name: logs_eventos_requerimento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs_eventos_requerimento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requerimento_id uuid,
    tipo_evento text,
    descricao text,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT logs_eventos_requerimento_tipo_evento_check CHECK ((tipo_evento = ANY (ARRAY['mudanca_status'::text, 'confirmacao_beneficio'::text])))
);


--
-- Name: parametros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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


--
-- Name: parametros_financeiros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametros_financeiros (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT parametros_financeiros_dia_vencimento_check CHECK (((dia_vencimento >= 1) AND (dia_vencimento <= 28))),
    CONSTRAINT parametros_financeiros_regime_padrao_check CHECK ((regime_padrao = ANY (ARRAY['anuidade'::text, 'mensalidade'::text])))
);


--
-- Name: reap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reap (
    cpf text NOT NULL,
    simplificado jsonb DEFAULT '{}'::jsonb NOT NULL,
    anual jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    observacoes text
);


--
-- Name: requerimentos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requerimentos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cod_req text,
    data_assinatura date,
    cpf text,
    ano_referencia integer NOT NULL,
    status_mte text DEFAULT 'assinado'::text NOT NULL,
    data_envio date,
    num_req_mte text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    beneficio_recebido boolean DEFAULT false NOT NULL,
    CONSTRAINT requerimentos_status_mte_check CHECK ((status_mte = ANY (ARRAY['assinado'::text, 'analise'::text, 'recurso_acerto'::text, 'deferido'::text, 'indeferido'::text])))
);


--
-- Name: socios; Type: TABLE; Schema: public; Owner: -
--

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
    uf_rg text,
    dt_expedicao_rg date,
    cpf text,
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
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

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
    font_configurations text
);


--
-- Name: tipos_cobranca; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_cobranca (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    categoria text,
    nome text,
    descricao text,
    valor_padrao numeric,
    obrigatoriedade text,
    ativo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tipos_cobranca_categoria_check CHECK ((categoria = ANY (ARRAY['contribuicao'::text, 'cadastro_governamental'::text]))),
    CONSTRAINT tipos_cobranca_obrigatoriedade_check CHECK ((obrigatoriedade = ANY (ARRAY['compulsoria'::text, 'facultativa'::text])))
);


--
-- Name: v_debitos_socio; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_debitos_socio WITH (security_invoker='on') AS
 SELECT s.cpf,
    s.nome,
    a.ano,
    (NOT (EXISTS ( SELECT 1
           FROM public.financeiro_lancamentos fl
          WHERE ((fl.socio_cpf = s.cpf) AND (fl.tipo = 'anuidade'::text) AND (fl.competencia_ano = a.ano) AND (fl.status = 'pago'::text))))) AS anuidade_pendente,
    COALESCE(cfg.isento, false) AS isento,
    COALESCE(cfg.liberado_pelo_presidente, false) AS liberado
   FROM (((public.socios s
     CROSS JOIN ( SELECT generate_series(( SELECT COALESCE(min(parametros_financeiros.ano_base_cobranca), 2024) AS "coalesce"
                   FROM public.parametros_financeiros), (EXTRACT(year FROM CURRENT_DATE))::integer) AS ano) a)
     LEFT JOIN ( SELECT parametros_financeiros.regime_padrao
           FROM public.parametros_financeiros
         LIMIT 1) pf ON (true))
     LEFT JOIN public.financeiro_config_socio cfg ON ((cfg.cpf = s.cpf)))
  WHERE ((COALESCE(cfg.regime, pf.regime_padrao) = 'anuidade'::text) AND (a.ano >= ( SELECT COALESCE(min(parametros_financeiros.ano_base_cobranca), 2024) AS "coalesce"
           FROM public.parametros_financeiros)));


--
-- Name: v_requerimentos_busca; Type: VIEW; Schema: public; Owner: -
--

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
    s.nit AS socio_nit
   FROM (public.requerimentos r
     LEFT JOIN public.socios s ON ((r.cpf = s.cpf)));


--
-- Name: v_situacao_financeira_socio; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_situacao_financeira_socio AS
 SELECT cpf,
    nome,
    situacao_associativa,
    regime,
    isento,
    liberado_presidente,
    anuidades_pagas,
    ultimo_pagamento,
    public.get_socio_financial_status(cpf, regime, isento, liberado_presidente) AS situacao_geral,
    meses_pagos_atual
   FROM ( SELECT s.cpf,
            s.nome,
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
          GROUP BY s.cpf, s.nome, s.situacao, cfg.regime, pf.regime_padrao, cfg.isento, cfg.liberado_pelo_presidente) base;


--
-- Name: messages; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
)
PARTITION BY RANGE (inserted_at);


--
-- Name: messages_2026_04_19; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_04_19 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_04_20; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_04_20 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_04_21; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_04_21 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_04_22; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_04_22 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_04_23; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_04_23 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_04_24; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_04_24 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: messages_2026_04_25; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.messages_2026_04_25 (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);


--
-- Name: subscription; Type: TABLE; Schema: realtime; Owner: -
--

CREATE TABLE realtime.subscription (
    id bigint NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text,
    CONSTRAINT subscription_action_filter_check CHECK ((action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: subscription_id_seq; Type: SEQUENCE; Schema: realtime; Owner: -
--

ALTER TABLE realtime.subscription ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME realtime.subscription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);


--
-- Name: COLUMN buckets.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: buckets_analytics; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: buckets_vectors; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);


--
-- Name: COLUMN objects.owner; Type: COMMENT; Schema: storage; Owner: -
--

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


--
-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--
-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vector_indexes; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL COLLATE pg_catalog."C",
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text,
    migration_name text,
    status text,
    error_detail text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    idempotency_key text,
    rollback text[]
);


--
-- Name: messages_2026_04_19; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_04_19 FOR VALUES FROM ('2026-04-19 00:00:00') TO ('2026-04-20 00:00:00');


--
-- Name: messages_2026_04_20; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_04_20 FOR VALUES FROM ('2026-04-20 00:00:00') TO ('2026-04-21 00:00:00');


--
-- Name: messages_2026_04_21; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_04_21 FOR VALUES FROM ('2026-04-21 00:00:00') TO ('2026-04-22 00:00:00');


--
-- Name: messages_2026_04_22; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_04_22 FOR VALUES FROM ('2026-04-22 00:00:00') TO ('2026-04-23 00:00:00');


--
-- Name: messages_2026_04_23; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_04_23 FOR VALUES FROM ('2026-04-23 00:00:00') TO ('2026-04-24 00:00:00');


--
-- Name: messages_2026_04_24; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_04_24 FOR VALUES FROM ('2026-04-24 00:00:00') TO ('2026-04-25 00:00:00');


--
-- Name: messages_2026_04_25; Type: TABLE ATTACH; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages ATTACH PARTITION realtime.messages_2026_04_25 FOR VALUES FROM ('2026-04-25 00:00:00') TO ('2026-04-26 00:00:00');


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: mfa_amr_claims amr_id_pk; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: custom_oauth_providers custom_oauth_providers_identifier_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);


--
-- Name: custom_oauth_providers custom_oauth_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.custom_oauth_providers
    ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);


--
-- Name: flow_state flow_state_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.flow_state
    ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identities identities_provider_id_provider_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_authentication_method_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);


--
-- Name: mfa_challenges mfa_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);


--
-- Name: mfa_factors mfa_factors_last_challenged_at_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);


--
-- Name: mfa_factors mfa_factors_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_code_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);


--
-- Name: oauth_authorizations oauth_authorizations_authorization_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);


--
-- Name: oauth_authorizations oauth_authorizations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);


--
-- Name: oauth_client_states oauth_client_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_client_states
    ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);


--
-- Name: oauth_consents oauth_consents_user_client_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);


--
-- Name: one_time_tokens one_time_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_unique; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);


--
-- Name: saml_providers saml_providers_entity_id_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);


--
-- Name: saml_providers saml_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);


--
-- Name: saml_relay_states saml_relay_states_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sso_domains sso_domains_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);


--
-- Name: sso_providers sso_providers_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_providers
    ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: webauthn_challenges webauthn_challenges_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._migrations
    ADD CONSTRAINT _migrations_pkey PRIMARY KEY (filename);


--
-- Name: audit_log_financeiro audit_log_financeiro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_financeiro
    ADD CONSTRAINT audit_log_financeiro_pkey PRIMARY KEY (id);


--
-- Name: configuracao_entidade configuracao_entidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracao_entidade
    ADD CONSTRAINT configuracao_entidade_pkey PRIMARY KEY (id);


--
-- Name: entidade entidade_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entidade
    ADD CONSTRAINT entidade_pkey PRIMARY KEY (id);


--
-- Name: financeiro_cobrancas_geradas financeiro_cobrancas_geradas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_pkey PRIMARY KEY (id);


--
-- Name: financeiro_config_socio financeiro_config_socio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_config_socio
    ADD CONSTRAINT financeiro_config_socio_pkey PRIMARY KEY (cpf);


--
-- Name: financeiro_dae financeiro_dae_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_pkey PRIMARY KEY (id);


--
-- Name: financeiro_historico_regime financeiro_historico_regime_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_historico_regime
    ADD CONSTRAINT financeiro_historico_regime_pkey PRIMARY KEY (id);


--
-- Name: financeiro_lancamentos financeiro_lancamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_pkey PRIMARY KEY (id);


--
-- Name: foto_upload_tokens foto_upload_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foto_upload_tokens
    ADD CONSTRAINT foto_upload_tokens_pkey PRIMARY KEY (token);


--
-- Name: localidades localidades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.localidades
    ADD CONSTRAINT localidades_pkey PRIMARY KEY (id);


--
-- Name: logs_eventos_requerimento logs_eventos_requerimento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_eventos_requerimento
    ADD CONSTRAINT logs_eventos_requerimento_pkey PRIMARY KEY (id);


--
-- Name: parametros_financeiros parametros_financeiros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros_financeiros
    ADD CONSTRAINT parametros_financeiros_pkey PRIMARY KEY (id);


--
-- Name: parametros parametros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametros
    ADD CONSTRAINT parametros_pkey PRIMARY KEY (id);


--
-- Name: reap reap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reap
    ADD CONSTRAINT reap_pkey PRIMARY KEY (cpf);


--
-- Name: requerimentos requerimentos_cod_req_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT requerimentos_cod_req_key UNIQUE (cod_req);


--
-- Name: requerimentos requerimentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT requerimentos_pkey PRIMARY KEY (id);


--
-- Name: socios socios_cpf_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_cpf_key UNIQUE (cpf);


--
-- Name: socios socios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.socios
    ADD CONSTRAINT socios_pkey PRIMARY KEY (id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: tipos_cobranca tipos_cobranca_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_cobranca
    ADD CONSTRAINT tipos_cobranca_pkey PRIMARY KEY (id);


--
-- Name: requerimentos unique_cpf_ano; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT unique_cpf_ano UNIQUE (cpf, ano_referencia);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_04_19 messages_2026_04_19_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_04_19
    ADD CONSTRAINT messages_2026_04_19_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_04_20 messages_2026_04_20_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_04_20
    ADD CONSTRAINT messages_2026_04_20_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_04_21 messages_2026_04_21_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_04_21
    ADD CONSTRAINT messages_2026_04_21_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_04_22 messages_2026_04_22_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_04_22
    ADD CONSTRAINT messages_2026_04_22_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_04_23 messages_2026_04_23_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_04_23
    ADD CONSTRAINT messages_2026_04_23_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_04_24 messages_2026_04_24_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_04_24
    ADD CONSTRAINT messages_2026_04_24_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: messages_2026_04_25 messages_2026_04_25_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.messages_2026_04_25
    ADD CONSTRAINT messages_2026_04_25_pkey PRIMARY KEY (id, inserted_at);


--
-- Name: subscription pk_subscription; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.subscription
    ADD CONSTRAINT pk_subscription PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: realtime; Owner: -
--

ALTER TABLE ONLY realtime.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: buckets_analytics buckets_analytics_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_analytics
    ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: buckets_vectors buckets_vectors_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets_vectors
    ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--
-- Name: vector_indexes vector_indexes_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_idempotency_key_key; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: schema_migrations schema_migrations_migration_name_key; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_migration_name_key UNIQUE (migration_name);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: confirmation_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: custom_oauth_providers_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);


--
-- Name: custom_oauth_providers_enabled_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);


--
-- Name: custom_oauth_providers_identifier_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);


--
-- Name: custom_oauth_providers_provider_type_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);


--
-- Name: email_change_token_current_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);


--
-- Name: email_change_token_new_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);


--
-- Name: factor_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);


--
-- Name: flow_state_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);


--
-- Name: identities_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);


--
-- Name: INDEX identities_email_idx; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.identities_email_idx IS 'Auth: Ensures indexed queries on the email column';


--
-- Name: identities_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);


--
-- Name: idx_auth_code; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);


--
-- Name: idx_oauth_client_states_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);


--
-- Name: idx_user_id_auth_method; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);


--
-- Name: mfa_challenge_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);


--
-- Name: mfa_factors_user_friendly_name_unique; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);


--
-- Name: mfa_factors_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);


--
-- Name: oauth_auth_pending_exp_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);


--
-- Name: oauth_clients_deleted_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);


--
-- Name: oauth_consents_active_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_active_user_client_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);


--
-- Name: oauth_consents_user_order_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);


--
-- Name: one_time_tokens_relates_to_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);


--
-- Name: one_time_tokens_token_hash_hash_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);


--
-- Name: one_time_tokens_user_id_token_type_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);


--
-- Name: reauthentication_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: recovery_token_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_parent_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);


--
-- Name: refresh_tokens_session_id_revoked_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);


--
-- Name: refresh_tokens_updated_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);


--
-- Name: saml_providers_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);


--
-- Name: saml_relay_states_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);


--
-- Name: saml_relay_states_for_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);


--
-- Name: saml_relay_states_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);


--
-- Name: sessions_not_after_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);


--
-- Name: sessions_oauth_client_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);


--
-- Name: sso_domains_domain_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));


--
-- Name: sso_domains_sso_provider_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);


--
-- Name: sso_providers_resource_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));


--
-- Name: sso_providers_resource_id_pattern_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);


--
-- Name: unique_phone_factor_per_user; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);


--
-- Name: user_id_created_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);


--
-- Name: users_email_partial_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);


--
-- Name: INDEX users_email_partial_key; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON INDEX auth.users_email_partial_key IS 'Auth: A partial unique index that applies only when is_sso_user is false';


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: users_is_anonymous_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);


--
-- Name: webauthn_challenges_expires_at_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);


--
-- Name: webauthn_challenges_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);


--
-- Name: webauthn_credentials_credential_id_key; Type: INDEX; Schema: auth; Owner: -
--

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


--
-- Name: webauthn_credentials_user_id_idx; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);


--
-- Name: financeiro_cobrancas_geradas_tipo_id_socio_cpf_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX financeiro_cobrancas_geradas_tipo_id_socio_cpf_key ON public.financeiro_cobrancas_geradas USING btree (tipo_cobranca_id, socio_cpf);


--
-- Name: financeiro_dae_active_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX financeiro_dae_active_month_idx ON public.financeiro_dae USING btree (socio_cpf, competencia_ano, competencia_mes) WHERE (status <> 'cancelado'::text);


--
-- Name: idx_cobrancas_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cobrancas_socio ON public.financeiro_cobrancas_geradas USING btree (socio_cpf);


--
-- Name: idx_cobrancas_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cobrancas_status ON public.financeiro_cobrancas_geradas USING btree (status);


--
-- Name: idx_cobrancas_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cobrancas_tipo ON public.financeiro_cobrancas_geradas USING btree (tipo_cobranca_id);


--
-- Name: idx_dae_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dae_comp ON public.financeiro_dae USING btree (competencia_ano, competencia_mes);


--
-- Name: idx_dae_grupo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dae_grupo ON public.financeiro_dae USING btree (grupo_id);


--
-- Name: idx_dae_sessao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dae_sessao ON public.financeiro_dae USING btree (sessao_id);


--
-- Name: idx_dae_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dae_socio ON public.financeiro_dae USING btree (socio_cpf);


--
-- Name: idx_fin_lanc_comp_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_comp_ano ON public.financeiro_lancamentos USING btree (competencia_ano);


--
-- Name: idx_fin_lanc_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_data ON public.financeiro_lancamentos USING btree (data_pagamento);


--
-- Name: idx_fin_lanc_sessao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_sessao ON public.financeiro_lancamentos USING btree (sessao_id);


--
-- Name: idx_fin_lanc_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_socio ON public.financeiro_lancamentos USING btree (socio_cpf);


--
-- Name: idx_fin_lanc_socio_tipo_comp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_socio_tipo_comp ON public.financeiro_lancamentos USING btree (socio_cpf, tipo, competencia_ano, competencia_mes);


--
-- Name: idx_fin_lanc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_status ON public.financeiro_lancamentos USING btree (status);


--
-- Name: idx_fin_lanc_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_tipo ON public.financeiro_lancamentos USING btree (tipo);


--
-- Name: idx_fin_lanc_tipo_cobranca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fin_lanc_tipo_cobranca ON public.financeiro_lancamentos USING btree (tipo_cobranca_id);


--
-- Name: idx_regime_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_regime_socio ON public.financeiro_historico_regime USING btree (socio_cpf);


--
-- Name: idx_socios_birth_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_socios_birth_month ON public.socios USING btree (EXTRACT(month FROM data_de_nascimento));


--
-- Name: idx_socios_codigo_socio_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_socios_codigo_socio_trgm ON public.socios USING gin (codigo_do_socio public.gin_trgm_ops);


--
-- Name: idx_socios_cpf_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_socios_cpf_trgm ON public.socios USING gin (cpf public.gin_trgm_ops);


--
-- Name: idx_socios_nome_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_socios_nome_trgm ON public.socios USING gin (nome public.gin_trgm_ops);


--
-- Name: idx_tipos_cobranca_ativo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tipos_cobranca_ativo ON public.tipos_cobranca USING btree (ativo);


--
-- Name: idx_tipos_cobranca_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tipos_cobranca_categoria ON public.tipos_cobranca USING btree (categoria);


--
-- Name: uniq_anuidade_por_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_anuidade_por_ano ON public.financeiro_lancamentos USING btree (socio_cpf, competencia_ano) WHERE ((tipo = 'anuidade'::text) AND (status = 'pago'::text));


--
-- Name: uniq_mensalidade_por_mes; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_mensalidade_por_mes ON public.financeiro_lancamentos USING btree (socio_cpf, competencia_ano, competencia_mes) WHERE ((tipo = 'mensalidade'::text) AND (status = 'pago'::text));


--
-- Name: uniq_tipo_cobranca_por_socio; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_tipo_cobranca_por_socio ON public.financeiro_lancamentos USING btree (socio_cpf, tipo_cobranca_id) WHERE ((status = 'pago'::text) AND (tipo_cobranca_id IS NOT NULL));


--
-- Name: ix_realtime_subscription_entity; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);


--
-- Name: messages_inserted_at_topic_index; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_04_19_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_04_19_inserted_at_topic_idx ON realtime.messages_2026_04_19 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_04_20_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_04_20_inserted_at_topic_idx ON realtime.messages_2026_04_20 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_04_21_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_04_21_inserted_at_topic_idx ON realtime.messages_2026_04_21 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_04_22_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_04_22_inserted_at_topic_idx ON realtime.messages_2026_04_22 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_04_23_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_04_23_inserted_at_topic_idx ON realtime.messages_2026_04_23 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_04_24_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_04_24_inserted_at_topic_idx ON realtime.messages_2026_04_24 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: messages_2026_04_25_inserted_at_topic_idx; Type: INDEX; Schema: realtime; Owner: -
--

CREATE INDEX messages_2026_04_25_inserted_at_topic_idx ON realtime.messages_2026_04_25 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));


--
-- Name: subscription_subscription_id_entity_filters_action_filter_key; Type: INDEX; Schema: realtime; Owner: -
--

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: buckets_analytics_unique_name_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);


--
-- Name: idx_multipart_uploads_list; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);


--
-- Name: idx_objects_bucket_id_name; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE \"C\");


--
-- Name: idx_objects_bucket_id_name_lower; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE \"C\");


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: -
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: vector_indexes_name_bucket_id_idx; Type: INDEX; Schema: storage; Owner: -
--

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);


--
-- Name: messages_2026_04_19_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_04_19_inserted_at_topic_idx;


--
-- Name: messages_2026_04_19_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_04_19_pkey;


--
-- Name: messages_2026_04_20_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_04_20_inserted_at_topic_idx;


--
-- Name: messages_2026_04_20_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_04_20_pkey;


--
-- Name: messages_2026_04_21_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_04_21_inserted_at_topic_idx;


--
-- Name: messages_2026_04_21_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_04_21_pkey;


--
-- Name: messages_2026_04_22_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_04_22_inserted_at_topic_idx;


--
-- Name: messages_2026_04_22_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_04_22_pkey;


--
-- Name: messages_2026_04_23_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_04_23_inserted_at_topic_idx;


--
-- Name: messages_2026_04_23_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_04_23_pkey;


--
-- Name: messages_2026_04_24_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_04_24_inserted_at_topic_idx;


--
-- Name: messages_2026_04_24_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_04_24_pkey;


--
-- Name: messages_2026_04_25_inserted_at_topic_idx; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_inserted_at_topic_index ATTACH PARTITION realtime.messages_2026_04_25_inserted_at_topic_idx;


--
-- Name: messages_2026_04_25_pkey; Type: INDEX ATTACH; Schema: realtime; Owner: -
--

ALTER INDEX realtime.messages_pkey ATTACH PARTITION realtime.messages_2026_04_25_pkey;


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: users on_auth_user_deleted; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_delete_user();


--
-- Name: users on_auth_user_updated; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_updated AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_update_user();


--
-- Name: parametros_financeiros tr_audit_parametros_financeiros; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_parametros_financeiros AFTER INSERT OR DELETE OR UPDATE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();


--
-- Name: tipos_cobranca tr_audit_tipos_cobranca; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_audit_tipos_cobranca AFTER INSERT OR DELETE OR UPDATE ON public.tipos_cobranca FOR EACH ROW EXECUTE FUNCTION public.proc_audit_finance_change();


--
-- Name: socios tr_check_member_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_check_member_limit BEFORE INSERT ON public.socios FOR EACH ROW EXECUTE FUNCTION public.check_member_limit();


--
-- Name: financeiro_cobrancas_geradas trg_cobrancas_geradas_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cobrancas_geradas_upd BEFORE UPDATE ON public.financeiro_cobrancas_geradas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_config_socio trg_fin_config_socio_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fin_config_socio_upd BEFORE UPDATE ON public.financeiro_config_socio FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_dae trg_fin_dae_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fin_dae_upd BEFORE UPDATE ON public.financeiro_dae FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: financeiro_lancamentos trg_fin_lancamentos_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fin_lancamentos_upd BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: parametros_financeiros trg_parametros_financeiros_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_parametros_financeiros_upd BEFORE UPDATE ON public.parametros_financeiros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: socios trg_socios_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_socios_upd BEFORE UPDATE ON public.socios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tipos_cobranca trg_tipos_cobranca_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tipos_cobranca_upd BEFORE UPDATE ON public.tipos_cobranca FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: requerimentos trigger_auto_generate_cod_req; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_generate_cod_req BEFORE INSERT ON public.requerimentos FOR EACH ROW EXECUTE FUNCTION public.auto_generate_cod_req();


--
-- Name: localidades trigger_generate_codigo_localidade; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_codigo_localidade BEFORE INSERT ON public.localidades FOR EACH ROW EXECUTE FUNCTION public.generate_next_codigo_localidade();


--
-- Name: subscription tr_check_filters; Type: TRIGGER; Schema: realtime; Owner: -
--

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();


--
-- Name: buckets enforce_bucket_name_length_trigger; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();


--
-- Name: buckets protect_buckets_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects protect_objects_delete; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();


--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mfa_amr_claims mfa_amr_claims_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_amr_claims
    ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: mfa_challenges mfa_challenges_auth_factor_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_challenges
    ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;


--
-- Name: mfa_factors mfa_factors_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.mfa_factors
    ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_authorizations oauth_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_authorizations
    ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: oauth_consents oauth_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.oauth_consents
    ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: one_time_tokens one_time_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.one_time_tokens
    ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;


--
-- Name: saml_providers saml_providers_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_providers
    ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_flow_state_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;


--
-- Name: saml_relay_states saml_relay_states_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.saml_relay_states
    ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sso_domains sso_domains_sso_provider_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sso_domains
    ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;


--
-- Name: webauthn_challenges webauthn_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_log_financeiro audit_log_financeiro_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_financeiro
    ADD CONSTRAINT audit_log_financeiro_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_cobrancas_geradas financeiro_cobrancas_geradas_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_cobrancas_geradas financeiro_cobrancas_geradas_lancamento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES public.financeiro_lancamentos(id);


--
-- Name: financeiro_cobrancas_geradas financeiro_cobrancas_geradas_socio_cpf_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);


--
-- Name: financeiro_cobrancas_geradas financeiro_cobrancas_geradas_tipo_cobranca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_cobrancas_geradas
    ADD CONSTRAINT financeiro_cobrancas_geradas_tipo_cobranca_id_fkey FOREIGN KEY (tipo_cobranca_id) REFERENCES public.tipos_cobranca(id);


--
-- Name: financeiro_config_socio financeiro_config_socio_cpf_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_config_socio
    ADD CONSTRAINT financeiro_config_socio_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf);


--
-- Name: financeiro_config_socio financeiro_config_socio_liberacao_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_config_socio
    ADD CONSTRAINT financeiro_config_socio_liberacao_usuario_id_fkey FOREIGN KEY (liberacao_usuario_id) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_dae financeiro_dae_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_dae financeiro_dae_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_dae financeiro_dae_socio_cpf_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_dae
    ADD CONSTRAINT financeiro_dae_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);


--
-- Name: financeiro_historico_regime financeiro_historico_regime_alterado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_historico_regime
    ADD CONSTRAINT financeiro_historico_regime_alterado_por_fkey FOREIGN KEY (alterado_por) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_historico_regime financeiro_historico_regime_socio_cpf_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_historico_regime
    ADD CONSTRAINT financeiro_historico_regime_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);


--
-- Name: financeiro_lancamentos financeiro_lancamentos_cancelado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_lancamentos financeiro_lancamentos_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.\"User\"(id);


--
-- Name: financeiro_lancamentos financeiro_lancamentos_socio_cpf_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_socio_cpf_fkey FOREIGN KEY (socio_cpf) REFERENCES public.socios(cpf);


--
-- Name: financeiro_lancamentos financeiro_lancamentos_tipo_cobranca_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financeiro_lancamentos
    ADD CONSTRAINT financeiro_lancamentos_tipo_cobranca_id_fkey FOREIGN KEY (tipo_cobranca_id) REFERENCES public.tipos_cobranca(id);


--
-- Name: logs_eventos_requerimento logs_eventos_requerimento_requerimento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_eventos_requerimento
    ADD CONSTRAINT logs_eventos_requerimento_requerimento_id_fkey FOREIGN KEY (requerimento_id) REFERENCES public.requerimentos(id);


--
-- Name: logs_eventos_requerimento logs_eventos_requerimento_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs_eventos_requerimento
    ADD CONSTRAINT logs_eventos_requerimento_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.\"User\"(id);


--
-- Name: reap reap_cpf_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reap
    ADD CONSTRAINT reap_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf) ON DELETE RESTRICT;


--
-- Name: requerimentos requerimentos_cpf_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requerimentos
    ADD CONSTRAINT requerimentos_cpf_fkey FOREIGN KEY (cpf) REFERENCES public.socios(cpf) ON DELETE CASCADE;


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT \"objects_bucketId_fkey\" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--
-- Name: vector_indexes vector_indexes_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.vector_indexes
    ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);


--
-- Name: audit_log_entries; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_state; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

--
-- Name: identities; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

--
-- Name: instances; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_amr_claims; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_challenges; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: mfa_factors; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: one_time_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: saml_relay_states; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_migrations; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: sessions; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_domains; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

--
-- Name: sso_providers; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: auth; Owner: -
--

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_financeiro Admins podem ver auditoria; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Admins podem ver auditoria\" ON public.audit_log_financeiro FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.\"User\"
  WHERE ((\"User\".id = ( SELECT auth.uid() AS uid)) AND (\"User\".role = 'admin'::text)))));


--
-- Name: audit_log_financeiro Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.audit_log_financeiro TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: entidade Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.entidade TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: financeiro_cobrancas_geradas Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.financeiro_cobrancas_geradas TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: financeiro_config_socio Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.financeiro_config_socio TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: financeiro_dae Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.financeiro_dae TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: financeiro_historico_regime Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.financeiro_historico_regime TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: financeiro_lancamentos Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.financeiro_lancamentos TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: localidades Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.localidades TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: parametros Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.parametros TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: parametros_financeiros Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.parametros_financeiros TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: reap Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.reap TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: requerimentos Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.requerimentos TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: socios Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.socios TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: templates Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.templates TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: tipos_cobranca Allow all for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow all for authenticated users\" ON public.tipos_cobranca TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));


--
-- Name: User Allow user to read own User data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow user to read own User data\" ON public.\"User\" FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid) = id) OR ((( SELECT (auth.jwt() -> 'app_metadata'::text)) ->> 'role'::text) = 'admin'::text)));


--
-- Name: User Allow user to update own data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Allow user to update own data\" ON public.\"User\" FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: foto_upload_tokens Enable insert for authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Enable insert for authenticated\" ON public.foto_upload_tokens FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: audit_log_financeiro Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Enable insert for authenticated users\" ON public.audit_log_financeiro FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: foto_upload_tokens Enable select by token; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Enable select by token\" ON public.foto_upload_tokens FOR SELECT USING (true);


--
-- Name: configuracao_entidade Permitir gesto para usurios autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Permitir gesto para usurios autenticados\" ON public.configuracao_entidade TO authenticated USING (true) WITH CHECK (true);


--
-- Name: configuracao_entidade Permitir leitura para todos autenticados; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Permitir leitura para todos autenticados\" ON public.configuracao_entidade FOR SELECT TO authenticated USING (true);


--
-- Name: User Service role can manage users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY \"Service role can manage users\" ON public.\"User\" TO service_role USING (true);


--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.\"User\" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_financeiro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_financeiro ENABLE ROW LEVEL SECURITY;

--
-- Name: configuracao_entidade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.configuracao_entidade ENABLE ROW LEVEL SECURITY;

--
-- Name: entidade; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entidade ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_cobrancas_geradas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_cobrancas_geradas ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_config_socio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_config_socio ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_dae; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_dae ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_historico_regime; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_historico_regime ENABLE ROW LEVEL SECURITY;

--
-- Name: financeiro_lancamentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

--
-- Name: foto_upload_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foto_upload_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: localidades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.localidades ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros ENABLE ROW LEVEL SECURITY;

--
-- Name: parametros_financeiros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametros_financeiros ENABLE ROW LEVEL SECURITY;

--
-- Name: reap; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reap ENABLE ROW LEVEL SECURITY;

--
-- Name: requerimentos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.requerimentos ENABLE ROW LEVEL SECURITY;

--
-- Name: socios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

--
-- Name: templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_cobranca; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_cobranca ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: realtime; Owner: -
--

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: objects Acesso pblico para visualizao de branding; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY \"Acesso pblico para visualizao de branding\" ON storage.objects FOR SELECT USING ((bucket_id = 'branding'::text));


--
-- Name: objects Acesso total para usurios autenticados no branding; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY \"Acesso total para usurios autenticados no branding\" ON storage.objects TO authenticated USING ((bucket_id = 'branding'::text)) WITH CHECK ((bucket_id = 'branding'::text));


--
-- Name: objects Acesso total para usurios autenticados_documentos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY \"Acesso total para usurios autenticados_documentos\" ON storage.objects TO authenticated USING ((bucket_id = 'documentos'::text));


--
-- Name: objects Acesso total para usurios autenticados_fotos; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY \"Acesso total para usurios autenticados_fotos\" ON storage.objects TO authenticated USING ((bucket_id = 'fotos'::text));


--
-- Name: objects Public Access; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY \"Public Access\" ON storage.objects FOR SELECT USING ((bucket_id = 'fotos'::text));


--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_analytics; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets_vectors; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

--
-- Name: migrations; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

--
-- Name: s3_multipart_uploads_parts; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

--
-- Name: vector_indexes; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime_messages_publication; Type: PUBLICATION; Schema: -; Owner: -
--

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


--
-- Name: supabase_realtime foto_upload_tokens; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.foto_upload_tokens;


--
-- Name: supabase_realtime_messages_publication messages; Type: PUBLICATION TABLE; Schema: realtime; Owner: -
--

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE ONLY realtime.messages;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: -
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


--
-- PostgreSQL database dump complete
--

`;