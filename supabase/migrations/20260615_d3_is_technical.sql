-- D3-IMPL: adiciona is_technical em tenant_units para distinguir Sede (unidade técnica)
-- dos polos operacionais. Aplicar em 3 fases:
--   Fase A: ADD COLUMN
--   Fase B: UPDATE manual das Sedes (confirmação humana por projeto)
--   Fase C: CREATE FUNCTION + CREATE TRIGGER

-- ─── Fase A ──────────────────────────────────────────────────────────────────

ALTER TABLE public.tenant_units
  ADD COLUMN IF NOT EXISTS is_technical boolean NOT NULL DEFAULT false;

-- ─── Fase C (aplicar APÓS Fase B) ───────────────────────────────────────────

-- Bloqueia DELETE de unit técnica (Sede)
CREATE OR REPLACE FUNCTION public.prevent_technical_unit_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_technical THEN
    RAISE EXCEPTION 'Não é permitido excluir a unidade técnica (Sede) do tenant.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS no_delete_technical_unit ON public.tenant_units;
CREATE TRIGGER no_delete_technical_unit
  BEFORE DELETE ON public.tenant_units
  FOR EACH ROW EXECUTE FUNCTION public.prevent_technical_unit_delete();

-- Bloqueia reversão de is_technical (true → false)
CREATE OR REPLACE FUNCTION public.prevent_technical_unit_demotion()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_technical AND NOT NEW.is_technical THEN
    RAISE EXCEPTION 'Não é permitido reclassificar uma unidade técnica (Sede).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS no_demote_technical_unit ON public.tenant_units;
CREATE TRIGGER no_demote_technical_unit
  BEFORE UPDATE ON public.tenant_units
  FOR EACH ROW EXECUTE FUNCTION public.prevent_technical_unit_demotion();
