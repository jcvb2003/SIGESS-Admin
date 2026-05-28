import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import type { AuthUser } from "../types";
import type { Database } from "@/services/supabase.types";
import { AuthContext } from "./useAuthHook";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY_KEY = "sigess_admin_last_activity";
const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "keydown",
  "mousemove",
  "scroll",
  "touchstart",
];

function getNow() {
  return Date.now();
}

function readLastActivity() {
  const raw = globalThis.localStorage.getItem(LAST_ACTIVITY_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function writeLastActivity(timestamp = getNow()) {
  globalThis.localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  return timestamp;
}

function clearLastActivity() {
  globalThis.localStorage.removeItem(LAST_ACTIVITY_KEY);
}

function isExpired(timestamp: number | null) {
  if (!timestamp) return false;
  return getNow() - timestamp >= INACTIVITY_LIMIT_MS;
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const timeoutRef = useRef<number | null>(null);
  const signOutInProgressRef = useRef(false);
  const userRef = useRef<AuthUser | null>(null);

  const clearInactivityTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const performSignOut = useCallback(
    async (reason?: "inactivity") => {
      if (signOutInProgressRef.current) return;
      signOutInProgressRef.current = true;
      clearInactivityTimeout();

      try {
        await supabase.auth.signOut();
      } catch (error) {
        console.warn("Erro ao encerrar sessão no Supabase:", error);
      } finally {
        clearLastActivity();
        setUser(null);
        signOutInProgressRef.current = false;
      }

      if (reason === "inactivity") {
        toast.error("Sessão encerrada após 30 minutos de inatividade.");
      }
    },
    [clearInactivityTimeout],
  );

  const scheduleInactivityTimeout = useCallback(() => {
    clearInactivityTimeout();

    if (!userRef.current) return;

    const lastActivity = readLastActivity();
    if (isExpired(lastActivity)) {
      void performSignOut("inactivity");
      return;
    }

    const remaining = Math.max(0, INACTIVITY_LIMIT_MS - (getNow() - (lastActivity ?? getNow())));
    timeoutRef.current = globalThis.setTimeout(() => {
      void performSignOut("inactivity");
    }, remaining);
  }, [clearInactivityTimeout, performSignOut]);

  const registerActivity = useCallback(() => {
    if (!userRef.current) return;
    writeLastActivity();
    scheduleInactivityTimeout();
  }, [scheduleInactivityTimeout]);

  const toAuthUser = useCallback(async (supabaseUser: User): Promise<AuthUser> => {
    return {
      id: supabaseUser.id,
      email: supabaseUser.email ?? null,
      isAdmin: supabaseUser.user_metadata?.is_admin === true,
    };
  }, []);

  const refreshUserPermissions = useCallback(async (supabaseUser: User) => {
    try {
      const { data: isAdmin, error } = await supabase.rpc("has_role", {
        _user_id: supabaseUser.id,
        _role: "admin" as Database["public"]["Enums"]["app_role"],
      });

      if (error) {
        console.warn("RPC has_role falhou (usando metadados):", error.message);
        return;
      }

      const freshAdminStatus = isAdmin === true || supabaseUser.user_metadata?.is_admin === true;

      setUser((prev) => {
        if (!prev || prev.id !== supabaseUser.id) return prev;
        if (prev.isAdmin === freshAdminStatus) return prev;
        return { ...prev, isAdmin: freshAdminStatus };
      });
    } catch (error) {
      console.error("Erro no check de permissões:", error);
    }
  }, []);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let mounted = true;

    const handleSession = async (session: { user: User } | null) => {
      if (!mounted) return;

      if (session?.user) {
        const lastActivity = readLastActivity();
        if (isExpired(lastActivity)) {
          await performSignOut("inactivity");
          if (mounted) {
            setIsLoading(false);
          }
          return;
        }

        const authUser = await toAuthUser(session.user);
        if (mounted) {
          setUser(authUser);
          setIsLoading(false);

          if (!lastActivity) {
            writeLastActivity();
          }
          scheduleInactivityTimeout();
          void refreshUserPermissions(session.user);
        }
      } else if (mounted) {
        clearInactivityTimeout();
        setUser(null);
        setIsLoading(false);
      }
    };

    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await handleSession(session);
      } catch (error) {
        console.error("Auth init error:", error);
        if (mounted) setIsLoading(false);
      }
    };

    void initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await handleSession(session);
    });

    return () => {
      mounted = false;
      clearInactivityTimeout();
      subscription.unsubscribe();
    };
  }, [clearInactivityTimeout, performSignOut, refreshUserPermissions, scheduleInactivityTimeout, toAuthUser]);

  useEffect(() => {
    if (!user) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const lastActivity = readLastActivity();
        if (isExpired(lastActivity)) {
          void performSignOut("inactivity");
          return;
        }
        scheduleInactivityTimeout();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAST_ACTIVITY_KEY) return;

      const lastActivity = event.newValue ? Number(event.newValue) : null;
      if (isExpired(lastActivity)) {
        void performSignOut("inactivity");
        return;
      }
      scheduleInactivityTimeout();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    globalThis.addEventListener("storage", onStorage);
    ACTIVITY_EVENTS.forEach((eventName) => {
      globalThis.addEventListener(eventName, registerActivity, { passive: true });
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      globalThis.removeEventListener("storage", onStorage);
      ACTIVITY_EVENTS.forEach((eventName) => {
        globalThis.removeEventListener(eventName, registerActivity);
      });
    };
  }, [performSignOut, registerActivity, scheduleInactivityTimeout, user]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    writeLastActivity();
  }, []);

  const signOut = useCallback(async () => {
    await performSignOut();
  }, [performSignOut]);

  const value = useMemo(() => ({ user, isLoading, signIn, signOut }), [user, isLoading, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
