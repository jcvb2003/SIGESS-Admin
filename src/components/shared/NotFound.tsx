import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-medium">404 — Página não encontrada</h1>
      <Link to="/" className="text-sm text-muted-foreground underline">
        Voltar ao início
      </Link>
    </div>
  );
}
