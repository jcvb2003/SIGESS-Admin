// @ts-expect-error: Deno-specific URL imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// @ts-expect-error: Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return json({ ok: false, reason: 'token_required' }, 400);

  // service_role — acesso total ao Admin DB para validar token
  const supabase = createClient(
    // @ts-expect-error: Deno env
    Deno.env.get('SUPABASE_URL')!,
    // @ts-expect-error: Deno env
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 1. Busca e valida o token
  const { data: pt, error: ptErr } = await supabase
    .from('billing_portal_tokens')
    .select('id, charge_id, billing_account_id, expires_at, consumed_at')
    .eq('token', token)
    .maybeSingle();

  if (ptErr || !pt) return json({ ok: false, reason: 'token_invalid' }, 404);
  if (new Date(pt.expires_at) < new Date()) return json({ ok: false, reason: 'token_expired' }, 410);

  // consumed_at indica pagamento confirmado — link ainda pode ser consultado (reutilizável até expirar)

  // 2. Atualiza accessed_at
  await supabase
    .from('billing_portal_tokens')
    .update({ accessed_at: new Date().toISOString() })
    .eq('id', pt.id);

  // 3. Resolve dados da conta — obrigatório
  const { data: account } = await supabase
    .from('billing_accounts')
    .select('admin_client_id, current_plan_id')
    .eq('id', pt.billing_account_id)
    .single();

  if (!account) {
    console.error('billing-portal: billing_account não encontrado para token', pt.id);
    return json({ ok: false, reason: 'account_not_found' }, 500);
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('nome_entidade')
    .eq('id', account.admin_client_id)
    .maybeSingle();

  if (!tenant) {
    console.error('billing-portal: tenant não encontrado para account', pt.billing_account_id);
    return json({ ok: false, reason: 'tenant_not_found' }, 500);
  }

  const { data: plan } = account.current_plan_id
    ? await supabase.from('billing_plans').select('name').eq('id', account.current_plan_id).maybeSingle()
    : { data: null };

  // 4. Resolve charge (se token for charge-specific) — obrigatório quando charge_id presente
  let amount: number | null = null;
  let due_date: string | null = null;
  let payment_url: string | null = null;

  if (pt.charge_id) {
    const { data: charge } = await supabase
      .from('billing_charges')
      .select('amount, due_date, payment_url')
      .eq('id', pt.charge_id)
      .maybeSingle();

    if (!charge) {
      console.error('billing-portal: billing_charge não encontrado para token', pt.id, 'charge_id', pt.charge_id);
      return json({ ok: false, reason: 'charge_not_found' }, 500);
    }

    amount = charge.amount;
    due_date = charge.due_date;
    payment_url = charge.payment_url;
  }

  return json({
    ok: true,
    tenant_name: tenant.nome_entidade,
    plan_name: plan?.name ?? null,
    amount,
    due_date,
    payment_url,
  });
});
