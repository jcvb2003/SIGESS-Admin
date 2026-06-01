// @ts-expect-error: Deno imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: { env: { get(key: string): string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code")?.toLowerCase().trim();

    if (!code) {
      return new Response(JSON.stringify({ error: "Parâmetro 'code' obrigatório" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!/^[a-z0-9-]+$/.test(code)) {
      return new Response(JSON.stringify({ error: "Código inválido" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Configuração interna ausente" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve pelo tenant_code: primeiro tenta clientes (nome comercial), depois projetos
    // SELECT explícito — nunca expor supabase_secret_keys nem supabase_access_token

    // 1. Tenta resolver pelo tenant_code do cliente (fonte canônica para o Web enquanto não migrar)
    const { data: clienteData } = await supabase
      .from("clientes")
      .select("nome_entidade, projetos(supabase_url, supabase_publishable_key, topology)")
      .eq("tenant_code", code)
      .maybeSingle();

    if (clienteData) {
      const proj = (clienteData as any).projetos;
      if (proj?.supabase_url && proj?.supabase_publishable_key) {
        return new Response(
          JSON.stringify({
            label: clienteData.nome_entidade,
            supabaseUrl: proj.supabase_url,
            anonKey: proj.supabase_publishable_key,
            deploymentMode: (proj.topology as string ?? "").startsWith("shared") ? "shared" : "isolated",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300, s-maxage=300" },
            status: 200,
          }
        );
      }
    }

    // 2. Fallback: resolve pelo tenant_code do projeto (projetos isolated_single antigos / compat)
    const { data, error } = await supabase
      .from("projetos")
      .select("project_name, supabase_url, supabase_publishable_key, topology")
      .eq("tenant_code", code)
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: "Tenant não encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    return new Response(
      JSON.stringify({
        label: data.project_name,
        supabaseUrl: data.supabase_url,
        anonKey: data.supabase_publishable_key,
        deploymentMode: (data.topology as string).startsWith("shared") ? "shared" : "isolated",
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
