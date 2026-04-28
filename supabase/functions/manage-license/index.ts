import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    const payload = await req.json()
    const { key, action, fingerprint } = payload

    if (!key || !action) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_params" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Valida chave, status e carrega dados
    const { data: license, error: fetchError } = await supabase
      .from("licenses")
      .select("key, fingerprints, device_metadata, plan, status, expires_at, max_devices, usage_manual, max_manual, usage_turbo, max_turbo, usage_agro, max_agro")
      .eq("key", key)
      .single()

    if (fetchError || !license) {
      return new Response(
        JSON.stringify({ ok: false, reason: "invalid_key" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (license.status === "blocked") {
      return new Response(
        JSON.stringify({ ok: false, reason: "invalid_key" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ?? list_devices ?????????????????????????????????????????????????????????
    if (action === "list_devices") {
      const fingerprints = (license.fingerprints ?? []) as string[]
      const metadata = (license.device_metadata ?? {}) as Record<string, string>

      const devices = fingerprints.map((fp: string) => ({
        fingerprint: fp,
        nome: metadata[fp] ?? "Dispositivo sem nome",
      }))

      return new Response(
        JSON.stringify({
          ok: true,
          plan: license.plan,
          status: license.status,
          expires_at: license.expires_at,
          devices,
          max_devices: license.max_devices,
          usage: {
            manual: { used: license.usage_manual, max: license.max_manual },
            turbo:  { used: license.usage_turbo,  max: license.max_turbo  },
            agro:   { used: license.usage_agro,   max: license.max_agro   },
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ?? deactivate_device ????????????????????????????????????????????????????
    if (action === "deactivate_device") {
      if (!fingerprint) {
        return new Response(
          JSON.stringify({ ok: false, reason: "missing_fingerprint" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const fingerprints = (license.fingerprints ?? []) as string[]
      if (!fingerprints.includes(fingerprint)) {
        return new Response(
          JSON.stringify({ ok: false, reason: "device_not_found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const { data: result, error: rpcError } = await supabase.rpc("deactivate_device", {
        p_key: key,
        p_fingerprint: fingerprint,
      })

      if (rpcError) throw rpcError

      // REALTIME BROADCAST: Notifica a extensao para invalidar o cache
      if (result.ok) {
        console.info(`[Broadcast] Invaliding license cache: ${key}`);
        const channel = supabase.channel(`sigess:license:${key}`)
        await channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const resp = await channel.send({
              type: 'broadcast',
              event: 'INVALIDATE_CACHE',
              payload: { fingerprint }
            })
            console.info(`[Broadcast] Signal sent for device ${fingerprint}:`, resp);
            // Remove o canal apos o envio para nao deixar conexoes abertas
            await supabase.removeChannel(channel)
          }
        })
      }

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ ok: false, reason: "unknown_action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err: any) {
    console.error("manage-license error:", err)
    return new Response(
      JSON.stringify({ ok: false, reason: "internal_error", message: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
