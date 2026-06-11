-- Migration: D1 — Formalizar Formulação A do invariante de membership
-- Declaração oficial: todo tenant tem >=1 unit; todo operador (presidente/auxiliar) tem >=1 membership ativa; owner NÃO tem membership.
-- Sem alteração de comportamento — apenas COMMENT ON para persistir a regra no schema.

COMMENT ON TABLE public.tenant_units IS
  'Polos ou unidades de um tenant. Invariante: todo tenant tem sempre >=1 unit ativa (a "Sede" em topologias sem polos de negócio). Nenhum tenant pode ficar com 0 units.';

COMMENT ON TABLE public.tenant_users IS
  'Vínculo de um usuário com um tenant. tenant_role=''owner'' governa o tenant; tenant_role=''member'' opera dentro de polos via user_unit_memberships. Transição owner<->member é proibida por domínio.';

COMMENT ON TABLE public.user_unit_memberships IS
  'Mapeamento de autorização entre usuários operadores e as units que podem acessar. Formulação A (oficial): todo operador (operator_type IN (''presidente'',''auxiliar'')) tem >=1 membership ativa; owner NÃO pertence a esta tabela.';

COMMENT ON TRIGGER trg_no_owner_membership ON public.user_unit_memberships IS
  'Formulação A — lado negativo: bloqueia INSERT/UPDATE que associaria um owner a uma unit. owner governa o tenant pelo tenant_role, não pelo polo.';

COMMENT ON TRIGGER trg_auto_membership_single_unit ON public.tenant_users IS
  'Formulação A — lado positivo: quando um tenant tem exatamente 1 unit, cria membership automaticamente para o novo usuário operador. Cobre topologias isolated_single e shared_multi_single (Sede).';

COMMENT ON TRIGGER trg_auxiliar_single_membership ON public.user_unit_memberships IS
  'Garante que auxiliar nunca tenha mais de 1 membership ativa simultaneamente. presidente pode ter N (um por polo).';

COMMENT ON TRIGGER trg_no_role_transition ON public.tenant_users IS
  'Bloqueia qualquer transição owner<->member. A fronteira entre dono do tenant e operador de polo é permanente — não existe "promoção" ou "rebaixamento".';
