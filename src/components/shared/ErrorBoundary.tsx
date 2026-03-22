import { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
          <div className="p-4 bg-destructive/10 rounded-full text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-medium">Algo deu errado</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {this.state.error?.message || "Ocorreu um erro inesperado nesta seção."}
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => this.setState({ hasError: false })}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
