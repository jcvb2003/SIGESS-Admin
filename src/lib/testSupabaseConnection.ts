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

  // Validate key format (JWT)
  const jwtPattern = /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
  
  if (!jwtPattern.test(anonKey)) {
    return {
      success: false,
      message: "Chave pública (anon) inválida. Deve ser um token JWT válido.",
    };
  }

  if (!jwtPattern.test(serviceRoleKey)) {
    return {
      success: false,
      message: "Chave secreta (service_role) inválida. Deve ser um token JWT válido.",
    };
  }

  try {
    // Test connection with service role key
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
    } catch {
      hasStorage = false;
    }

    // Test auth access
    let hasAuth = false;
    try {
      const { error: authError } = await client.auth.admin.listUsers({ perPage: 1 });
      hasAuth = !authError;
    } catch {
      hasAuth = false;
    }

    if (!hasStorage && !hasAuth) {
      return {
        success: false,
        message: "Não foi possível acessar o projeto. Verifique se a chave service_role está correta.",
      };
    }

    return {
      success: true,
      message: "Conexão estabelecida com sucesso!",
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