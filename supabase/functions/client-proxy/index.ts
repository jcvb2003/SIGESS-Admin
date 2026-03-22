// @ts-expect-error: Deno-specific URL imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error: Deno-specific URL imports
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper to handle client-side actions securely
async function performAction(action: string, clientUrl: string, clientKey: string) {
  if (action === "list-users") {
    const res = await fetch(`${clientUrl}/auth/v1/admin/users?page=1&per_page=100`, {
      headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
    });
    return await res.json();
  }

  if (action === "list-tables") {
    const res = await fetch(`${clientUrl}/rest/v1/`, {
      headers: { apikey: clientKey, Authorization: `Bearer ${clientKey}` },
    });
    return await res.json();
  }

  if (action === "list-buckets") {
    const supabase = createClient(clientUrl, clientKey);
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    return data || [];
  }

  if (action === "health-check") {
    const start = Date.now();
    try {
      const res = await fetch(clientUrl, { method: "OPTIONS" });
      return { 
        status: res.status < 500 ? "online" : "offline", 
        latency: Date.now() - start,
        code: res.status 
      };
    } catch (e) {
      const err = e as Error;
      return { status: "offline", error: err.message };
    }
  }

  throw new Error(`Invalid action: ${action}`);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // @ts-expect-error: Deno global is available in Edge Functions runtime
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // @ts-expect-error: Deno global is available in Edge Functions runtime
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clientId, action } = await req.json();

    if (!clientId || !action) {
      return new Response(JSON.stringify({ error: "Missing parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client, error: clientError } = await supabaseAdmin
      .from("entidades")
      .select("supabase_url, supabase_secret_keys")
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await performAction(action, client.supabase_url, client.supabase_secret_keys);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
