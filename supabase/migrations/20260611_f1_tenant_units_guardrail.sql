-- Migration: F1 — Guardrail "tenant nunca fica com 0 units ativas"
-- Cobre: DELETE da última unit ativa + UPDATE is_active=false na última unit ativa
-- Cobre: múltiplas linhas na mesma transação (trigger BEFORE por linha, exclui OLD.id do count)
-- Não bloqueia: DELETE de unit inativa (sem impacto no invariante)
-- Não bloqueia: UPDATE de outros campos (timing, name, etc.)

CREATE OR REPLACE FUNCTION public.fn_tenant_units_min_one()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_remaining integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Só relevante se a unit deletada estava ativa
    IF NOT OLD.is_active THEN
      RETURN OLD;
    END IF;
    v_tenant_id := OLD.tenant_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Só relevante se estamos desativando uma unit ativa
    IF NOT (OLD.is_active = true AND NEW.is_active = false) THEN
      RETURN NEW;
    END IF;
    v_tenant_id := OLD.tenant_id;
  END IF;

  -- Conta units ativas restantes excluindo a linha atual (que ainda existe no BEFORE)
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_units_min_one
BEFORE DELETE OR UPDATE ON public.tenant_units
FOR EACH ROW EXECUTE FUNCTION public.fn_tenant_units_min_one();

COMMENT ON TRIGGER trg_tenant_units_min_one ON public.tenant_units IS
  'F1 guardrail: bloqueia DELETE e UPDATE is_active=false que deixariam o tenant sem nenhuma unit ativa. Cobre múltiplas linhas na mesma transação.';
