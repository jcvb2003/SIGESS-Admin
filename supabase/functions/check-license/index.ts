import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const APP_SECRET = Deno.env.get("APP_SECRET");

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-secret",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const secret = req.headers.get("x-app-secret");
    // Segurança Mandatória: Exige o segredo do app para qualquer validação
    if (!APP_SECRET || secret !== APP_SECRET) {
      return new Response(JSON.stringify({ ok: false, reason: "unauthorized_access" }), { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    const body = await req.json();
    const { key, fingerprint, action, usage_type, device_name } = body;

    if (!key || !fingerprint) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_parameters" }), { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const rpcName = action === "check" ? "check_and_use_license" : "get_license_status";
    const rpcParams = { 
      p_key: key, 
      p_fingerprint: fingerprint,
      p_usage_type: usage_type || "manual",
      p_device_name: device_name
    };

    const { data: result, error } = await supabaseClient.rpc(rpcName, rpcParams);

    if (error || !result) {
      console.error("RPC Error or null result:", error);
      return new Response(JSON.stringify({ ok: false, reason: "invalid_key", details: error?.message }), { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Add valid_until for anti-replay (15 minutes of cache)
    const validUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    
    // Fixamos a ordem das chaves para que a assinatura JSON.stringify seja determinística
    // Deve coincidir EXATAMENTE com a ordem reconstruída no cliente (license.ts)
    const payload = {
      ok: result.ok,
      plan: result.plan,
      status: result.status,
      usage_manual: result.usage_manual,
      max_manual: result.max_manual,
      usage_turbo: result.usage_turbo,
      max_turbo: result.max_turbo,
      usage_agro: result.usage_agro,
      max_agro: result.max_agro,
      usage_count: result.usage_count,
      max_usage: result.max_usage,
      devices: result.devices,
      max_devices: result.max_devices,
      expires_at: result.expires_at,
      valid_until: validUntil,
      updated_at: result.updated_at
    };

    const payloadStr = JSON.stringify(payload);
    const keyData = new TextEncoder().encode(APP_SECRET);
    const msgData = new TextEncoder().encode(payloadStr);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw", 
      keyData, 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign"]
    );
    
    const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const sig = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Extraímos o nome específico deste dispositivo do metadados retornado pelo banco
    const specificDeviceName = result.device_metadata?.[fingerprint] || "PC";

    return new Response(JSON.stringify({ ...payload, sig, device_name: specificDeviceName }), { 
      headers: corsHeaders 
    });

  } catch (err: any) {
    console.error("Function Error:", err);
    return new Response(JSON.stringify({ ok: false, reason: "internal_error", error: err.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});
