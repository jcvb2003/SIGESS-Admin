import { useState } from "react";
import { Key, Plus, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseAccounts, useCreateSupabaseAccount, useDeleteSupabaseAccount } from "../hooks/useSystemSettings";
import { toast } from "sonner";

export function SupabaseAccountsSettings() {
  const { data: accounts = [], isLoading } = useSupabaseAccounts();
  const createAccount = useCreateSupabaseAccount();
  const deleteAccount = useDeleteSupabaseAccount();

  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newMax, setNewMax] = useState(2);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel || !newToken) return;

    try {
      await createAccount.mutateAsync({
        label: newLabel,
        management_token: newToken,
        max_projects: newMax
      });
      toast.success("Conta adicionada com sucesso!");
      setIsAdding(false);
      setNewLabel("");
      setNewToken("");
      setNewMax(2);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao adicionar conta";
      toast.error(message);
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Contas Supabase (PAT)</h2>
            <p className="text-sm text-muted-foreground">
              Tokens de acesso pessoal para criar e gerenciar projetos
            </p>
          </div>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)} variant={isAdding ? "ghost" : "outline"} size="sm">
          {isAdding ? "Cancelar" : <><Plus className="h-4 w-4 mr-2" /> Nova Conta</>}
        </Button>
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="mb-6 p-4 border rounded-lg bg-secondary/20 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome Identificador</Label>
              <Input 
                placeholder="Ex: Minha Conta Pessoal" 
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Limite de Projetos (Plano)</Label>
              <Input 
                type="number" 
                value={newMax}
                onChange={(e) => setNewMax(Number.parseInt(e.target.value, 10))}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Management Token (PAT)</Label>
            <div className="relative">
              <input type="text" name="username" value="supabase-pat" readOnly className="hidden" aria-hidden="true" tabIndex={-1} />
              <Input 
                type="password"
                autoComplete="new-password"
                placeholder="sbp_..." 
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">Este token será validado na API do Supabase ao salvar.</p>
          </div>
          <Button type="submit" className="w-full" disabled={createAccount.isPending}>
            {createAccount.isPending ? <Loader2 className="spin h-4 w-4 mr-2" /> : <Key className="mr-2 h-4 w-4" />}
            Validar e Salvar Conta
          </Button>
        </form>
      )}

      <div className="space-y-3">
        {accounts.length === 0 && !isAdding && (
          <p className="text-center py-4 text-sm text-muted-foreground italic">Nenhuma conta cadastrada.</p>
        )}
        
        {accounts.map((acc) => (
          <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg border bg-secondary/10 group">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded bg-secondary flex items-center justify-center font-mono text-xs">
                {acc.active_projects}/{acc.max_projects}
              </div>
              <div>
                <p className="text-sm font-medium">{acc.label}</p>
                <code className="text-xs text-muted-foreground">{acc.management_token_masked}</code>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 transition-opacity"
                onClick={() => {
                  if (acc.id && confirm("Remover esta conta? O onboarding de novos clientes com ela falhará.")) {
                    deleteAccount.mutate(acc.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
