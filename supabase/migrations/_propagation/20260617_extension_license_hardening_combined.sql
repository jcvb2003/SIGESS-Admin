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
