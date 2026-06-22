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
