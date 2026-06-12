BEGIN;

-- Canonical trigger functions and triggers

CREATE OR REPLACE FUNCTION public.chk_no_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE user_id = NEW.user_id
      AND tenant_id = NEW.tenant_id
      AND tenant_role = 'owner'
  ) THEN
    RAISE EXCEPTION 'owner cannot have a unit membership';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_owner_membership ON public.user_unit_memberships;
CREATE TRIGGER trg_no_owner_membership
BEFORE INSERT OR UPDATE ON public.user_unit_memberships
FOR EACH ROW
EXECUTE FUNCTION public.chk_no_owner_membership();

CREATE OR REPLACE FUNCTION public.chk_no_role_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.tenant_role = 'owner' AND NEW.tenant_role <> 'owner')
     OR (OLD.tenant_role <> 'owner' AND NEW.tenant_role = 'owner') THEN
    RAISE EXCEPTION 'tenant_role transition between owner and member is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_role_transition ON public.tenant_users;
CREATE TRIGGER trg_no_role_transition
BEFORE UPDATE ON public.tenant_users
FOR EACH ROW
EXECUTE FUNCTION public.chk_no_role_transition();

CREATE OR REPLACE FUNCTION public.chk_auxiliar_single_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.tenant_users
      WHERE user_id = NEW.user_id
        AND tenant_id = NEW.tenant_id
        AND operator_type = 'auxiliar'
    )
    AND (
      SELECT COUNT(*)
      FROM public.user_unit_memberships
      WHERE user_id = NEW.user_id
        AND tenant_id = NEW.tenant_id
        AND is_active = true
        AND id IS DISTINCT FROM NEW.id
    ) > 0
  THEN
    RAISE EXCEPTION 'auxiliar can only have one active unit membership';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auxiliar_single_membership ON public.user_unit_memberships;
CREATE TRIGGER trg_auxiliar_single_membership
BEFORE INSERT OR UPDATE ON public.user_unit_memberships
FOR EACH ROW
EXECUTE FUNCTION public.chk_auxiliar_single_membership();

CREATE OR REPLACE FUNCTION public.fn_tenant_units_min_one()
RETURNS trigger
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

  SELECT count(*)
  INTO v_remaining
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_units_min_one ON public.tenant_units;
CREATE TRIGGER trg_tenant_units_min_one
BEFORE DELETE OR UPDATE ON public.tenant_units
FOR EACH ROW
EXECUTE FUNCTION public.fn_tenant_units_min_one();

CREATE OR REPLACE FUNCTION public.auto_membership_single_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_auto_membership_single_unit ON public.tenant_users;
CREATE TRIGGER trg_auto_membership_single_unit
AFTER INSERT ON public.tenant_users
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.auto_membership_single_unit();

DROP FUNCTION IF EXISTS public.fn_no_owner_membership();
DROP FUNCTION IF EXISTS public.fn_no_role_transition();

-- Templates write policies: owner or presidente

DROP POLICY IF EXISTS templates_insert ON public.templates;
CREATE POLICY templates_insert
ON public.templates
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = templates.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.is_active = true
      AND (tu.tenant_role = 'owner' OR tu.operator_type = 'presidente')
  )
);

DROP POLICY IF EXISTS templates_delete ON public.templates;
CREATE POLICY templates_delete
ON public.templates
FOR DELETE
TO authenticated
USING (
  public.is_tenant_owner(tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.tenant_users tu
    WHERE tu.tenant_id = templates.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.is_active = true
      AND (tu.tenant_role = 'owner' OR tu.operator_type = 'presidente')
  )
);

-- Canonical payments report RPC + cleanup of obsolete overloads

DROP FUNCTION IF EXISTS public.get_payments_by_period_paginated(date, date, integer, integer, text, text);
DROP FUNCTION IF EXISTS public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid);

CREATE OR REPLACE FUNCTION public.get_payments_by_period_paginated(
  p_start_date date,
  p_end_date date,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_order_by text DEFAULT 'data_pagamento',
  p_order_dir text DEFAULT 'DESC',
  p_unit_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_types text[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  data_pagamento date,
  tipo text,
  tipo_exibicao text,
  competencia_ano integer,
  competencia_mes integer,
  forma_pagamento text,
  valor numeric,
  created_at timestamp with time zone,
  socio_nome text,
  socio_cpf text,
  total_count bigint,
  total_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
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
              WHEN 'contribuicao' THEN 'Contribuição'
              WHEN 'cadastro_governamental' THEN 'Cadastro governamental'
              ELSE fl.tipo
            END
          )
        ELSE
          CASE fl.tipo
            WHEN 'anuidade' THEN 'Anuidade'
            WHEN 'mensalidade' THEN 'Mensalidade'
            WHEN 'inicial' THEN 'Taxa inicial'
            WHEN 'transferencia' THEN 'Transferência'
            ELSE fl.tipo
          END
      END AS tipo_exibicao,
      fl.competencia_ano,
      fl.competencia_mes,
      fl.forma_pagamento,
      fl.valor,
      fl.created_at,
      s.nome AS socio_nome,
      s.cpf AS socio_cpf
    FROM public.financeiro_lancamentos fl
    JOIN public.socios s ON s.cpf = fl.socio_cpf
    LEFT JOIN public.tipos_cobranca tc ON tc.id = fl.tipo_cobranca_id
    WHERE fl.status = 'pago'
      AND fl.data_pagamento >= p_start_date
      AND fl.data_pagamento <= p_end_date
      AND (p_unit_id IS NULL OR s.unit_id = p_unit_id)
      AND (
        p_types IS NULL
        OR cardinality(p_types) = 0
        OR fl.tipo = ANY (p_types)
      )
      AND (
        p_search IS NULL
        OR BTRIM(p_search) = ''
        OR s.nome ILIKE '%' || p_search || '%'
        OR s.cpf ILIKE '%' || p_search || '%'
        OR fl.tipo ILIKE '%' || p_search || '%'
        OR COALESCE(NULLIF(BTRIM(fl.descricao), ''), NULLIF(BTRIM(tc.nome), '')) ILIKE '%' || p_search || '%'
      )
  ),
  stats AS (
    SELECT COUNT(*) AS count, SUM(base.valor) AS amount
    FROM base
  )
  SELECT
    b.id,
    b.data_pagamento,
    b.tipo,
    b.tipo_exibicao,
    b.competencia_ano,
    b.competencia_mes,
    b.forma_pagamento,
    b.valor,
    b.created_at,
    b.socio_nome,
    b.socio_cpf,
    st.count AS total_count,
    st.amount AS total_amount
  FROM base b, stats st
  ORDER BY
    CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'ASC' THEN b.data_pagamento END ASC,
    CASE WHEN p_order_by = 'data_pagamento' AND p_order_dir = 'DESC' THEN b.data_pagamento END DESC,
    CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'ASC' THEN b.created_at END ASC,
    CASE WHEN p_order_by = 'created_at' AND p_order_dir = 'DESC' THEN b.created_at END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_by_period_paginated(date, date, integer, integer, text, text, uuid, text, text[]) TO service_role;

COMMIT;
