import { createClient } from "@supabase/supabase-js";

interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: {
    hasStorage: boolean;
    hasAuth: boolean;
  };
}

export async function testSupabaseConnection(
  url: string,
  anonKey: string,
  serviceRoleKey: string
): Promise<TestConnectionResult> {
  // Validate URL format
  if (!url.includes("supabase.co") && !url.includes("supabase.com")) {
    return {
      success: false,
      message: "URL do Supabase inválida. Deve conter supabase.co ou supabase.com",
    };
  }

  if (!anonKey || anonKey.trim().length < 10) {
    return {
      success: false,
      message: "Chave pública (anon) inválida. A chave parece estar vazia ou muito curta.",
    };
  }

  if (!serviceRoleKey || serviceRoleKey.trim().length < 10) {
    return {
      success: false,
      message: "Chave secreta (service_role) inválida. A chave parece estar vazia ou muito curta.",
    };
  }

  try {
    // 1. Test anon/public key via REST
    let anonWorks = false;
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });
      // 200 = valid key, 401/403 with "Invalid API key" = bad key
      if (res.ok) {
        anonWorks = true;
      } else {
        const body = await res.text();
        anonWorks = !body.includes('Invalid API key') && !body.includes('invalid_api_key');
      }
    } catch {
      anonWorks = false;
    }

    if (!anonWorks) {
      return {
        success: false,
        message: "Chave pública (anon) inválida. Verifique se está correta.",
      };
    }

    // 2. Test service role key via REST + SDK
    let serviceKeyWorks = false;
    
    // Try REST endpoint first
    try {
      const res = await fetch(`${url}/rest/v1/`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      });
      if (res.ok) {
        serviceKeyWorks = true;
      } else {
        const body = await res.text();
        serviceKeyWorks = !body.includes('Invalid API key') && !body.includes('invalid_api_key');
      }
    } catch {
      serviceKeyWorks = false;
    }

    const client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Test storage access
    let hasStorage = false;
    try {
      const { error: storageError } = await client.storage.listBuckets();
      hasStorage = !storageError;
      if (!storageError) serviceKeyWorks = true;
    } catch {
      hasStorage = false;
    }

    // Test auth access
    let hasAuth = false;
    try {
      const { error: authError } = await client.auth.admin.listUsers({ perPage: 1 });
      hasAuth = !authError;
      if (!authError) serviceKeyWorks = true;
    } catch {
      hasAuth = false;
    }

    if (!serviceKeyWorks) {
      return {
        success: false,
        message: "Chave secreta (service_role) inválida. Verifique se está correta.",
      };
    }

    return {
      success: true,
      message: "Conexão estabelecida com sucesso! Ambas as chaves estão válidas.",
      details: {
        hasStorage,
        hasAuth,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Erro ao conectar: ${error.message}`,
    };
  }
}
