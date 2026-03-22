import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import type { AuthUser } from "../types";
import type { Database } from "@/services/supabase.types";

import { AuthContext } from "./useAuthHook";

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Mapeia o usuário do Supabase para AuthUser + check de admin via RPC.
  // IMPORTANTE: Agora fazemos o check de admin de forma assíncrona para não travar o carregamento inicial.
  const toAuthUser = useCallback(async (supabaseUser: User): Promise<AuthUser> => {
    // 1. Inicia com o que temos nos metadados (rápido e persistente)
    const initialUser: AuthUser = {
      id: supabaseUser.id,
      email: supabaseUser.email ?? null,
      isAdmin: supabaseUser.user_metadata?.is_admin === true,
    };

    // Retorna o usuário base IMEDIATAMENTE para liberar a UI
    return initialUser;
  }, []);

  // Função separada para atualizar as permissões do usuário se necessário (background check)
  const refreshUserPermissions = useCallback(async (supabaseUser: User) => {
    try {
      const { data: isAdmin, error } = await supabase.rpc('has_role', {
        _user_id: supabaseUser.id,
        _role: 'admin' as Database["public"]["Enums"]["app_role"]
      });

      if (error) {
        console.warn("RPC has_role falhou (usando metadados):", error.message);
        return;
      }

      const freshAdminStatus = isAdmin === true || (supabaseUser.user_metadata?.is_admin === true);
      
      setUser(prev => {
        if (!prev || prev.id !== supabaseUser.id) return prev;
        if (prev.isAdmin === freshAdminStatus) return prev; // Sem mudança
        return { ...prev, isAdmin: freshAdminStatus };
      });
    } catch (e) {
      console.error("Erro no check de permissões:", e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const handleSession = async (session: { user: User } | null) => {
      if (!mounted) return;

      if (session?.user) {
        // Primeiro carregamento "soft" (instantâneo)
        const authUser = await toAuthUser(session.user);
        if (mounted) {
          setUser(authUser);
          setIsLoading(false);
          
          // Check de permissões em "background" (não trava a UI)
          void refreshUserPermissions(session.user);
        }
      } else {
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    // Sincronização inicial
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await handleSession(session);
      } catch (e) {
        console.error("Auth init error:", e);
        if (mounted) setIsLoading(false);
      }
    };

    void initAuth();

    // Listener de mudanças
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await handleSession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [toAuthUser, refreshUserPermissions]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, isLoading, signIn, signOut }), [user, isLoading, signIn, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
