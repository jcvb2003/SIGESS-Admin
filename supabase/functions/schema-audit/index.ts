// @ts-expect-error: Deno imports
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { 
  DATABASE_SNAPSHOT_QUERY, 
  STORAGE_SNAPSHOT_QUERY,
  compareSnapshots,
  summarizeDiff,
  SchemaSnapshot,
  StorageSnapshot,
  AuthConfig,
  EdgeFunctionDef
} from "../_shared/schema-comparator.ts";
import { 
  extractProjectRef, 
  runManagementQuery,
  listEdgeFunctions 
} from "../_shared/supabase-management.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAuthConfig(projectRef: string, token: string): Promise<AuthConfig | null> {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return await response.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verificar auth (Admin)
    const authHeader = req.headers.get("Authorization") || "";
    const adminSupabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const adminServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!adminSupabaseUrl || !adminServiceKey) {
      throw new Error("Edge Function environment missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(adminSupabaseUrl, adminServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Validar JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: userAuth, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !userAuth?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Obter todas as entidades
    const { data: entidades, error: entError } = await supabase
      .from('entidades')
      .select('id, nome_entidade, tenant_code, supabase_url, supabase_access_token')
      .not('supabase_access_token', 'is', null);

    if (entError) throw new Error(`Failed to load tenants: ${entError.message}`);
    if (!entidades || entidades.length === 0) {
      return new Response(JSON.stringify({ message: "No tenants found with PAT" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const oeiras = entidades.find(e => e.tenant_code === 'sinpesca-oeiras');
    if (!oeiras) throw new Error("Reference tenant (sinpesca-oeiras) not found");

    const getSnapshot = async (projectRef: string, pat: string) => {
      const dbRows = await runManagementQuery(projectRef, pat, DATABASE_SNAPSHOT_QUERY);
      const stRows = await runManagementQuery(projectRef, pat, STORAGE_SNAPSHOT_QUERY);
      const auth = await getAuthConfig(projectRef, pat);
      const funcs = await listEdgeFunctions(projectRef, pat).catch(() => []);
      
      return {
        db: dbRows[0]?.snapshot as SchemaSnapshot || null,
        storage: stRows[0]?.snapshot as StorageSnapshot || null,
        auth: auth,
        functions: funcs as EdgeFunctionDef[]
      };
    };

    const refRef = extractProjectRef(oeiras.supabase_url);
    const refSnap = await getSnapshot(refRef, oeiras.supabase_access_token);

    if (!refSnap.db) throw new Error("Failed to load reference snapshot (OEIRAS)");

    const results = [];

    for (const tenant of entidades) {
      const tRef = extractProjectRef(tenant.supabase_url);
      try {
        const tSnap = await getSnapshot(tRef, tenant.supabase_access_token);
        
        if (!tSnap.db) {
          throw new Error("No DB snapshot returned");
        }

        const diffs = compareSnapshots(
          refSnap.db, tSnap.db,
          refSnap.storage, tSnap.storage,
          refSnap.auth, tSnap.auth,
          refSnap.functions, tSnap.functions
        );

        const summary = summarizeDiff(diffs);

        // Atualizar banco
        const { error: upsertErr } = await supabase
          .from('schema_sync_status')
          .upsert({
            tenant_id: tenant.id,
            checked_at: new Date().toISOString(),
            total_diffs: summary.total,
            diffs: diffs,
            summary: summary
          }, { onConflict: 'tenant_id' });

        if (upsertErr) {
          console.error(`Failed to upsert sync status for ${tenant.tenant_code}:`, upsertErr);
        }

        results.push({
          tenantId: tenant.id,
          tenantCode: tenant.tenant_code,
          totalDiffs: summary.total,
          summary
        });

      } catch (err) {
        console.error(`Error processing tenant ${tenant.tenant_code}:`, err);
        results.push({
          tenantId: tenant.id,
          tenantCode: tenant.tenant_code,
          error: String(err)
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Audit error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Internal Server Error" 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
