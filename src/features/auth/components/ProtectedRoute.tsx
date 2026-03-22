import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks";
import type { ReactNode } from "react";

interface Props {
  readonly children: ReactNode;
  readonly requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="text-muted-foreground text-sm">Carregando…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (requireAdmin && !user.isAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center space-y-4 bg-background p-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">Acesso Negado</h1>
        <p className="text-muted-foreground max-w-md">
          Você está logado como <strong>{user.email}</strong>, mas não possui permissão de administrador para acessar esta área.
        </p>
        <button 
          onClick={() => globalThis.location.href = "/auth"}
          className="text-primary hover:underline font-medium"
        >
          Voltar para o Login
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
