import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  readonly message?: string;
  readonly className?: string;
}

export function LoadingSpinner({ message = "Carregando...", className = "" }: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 space-y-4 ${className}`}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground animate-pulse">{message}</span>
    </div>
  );
}
