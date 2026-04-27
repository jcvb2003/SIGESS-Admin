import { useState } from "react";
import { Key, Plus, Trash2, ShieldCheck, Loader2, Edit2, Check, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupabaseAccounts, useCreateSupabaseAccount, useDeleteSupabaseAccount, useUpdateSupabaseAccount } from "../hooks/useSystemSettings";
import { toast } from "sonner";
import type { SupabaseAccountSafe } from "@/services/settings.service";

export function SupabaseAccountsSettings() {
  const { data: accounts = [], isLoading } = useSupabaseAccounts();
  const createAccount = useCreateSupabaseAccount();
  const updateAccount = useUpdateSupabaseAccount();
  const deleteAccount = useDeleteSupabaseAccount();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // States for both Add and Edit
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [maxProjects, setMaxProjects] = useState(2);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label || !token) return;

    try {
      await createAccount.mutateAsync({
        label,
        management_token: token,
        max_projects: maxProjects
      });
      toast.success("Conta adicionada com sucesso!");
      setIsAdding(false);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao adicionar conta";
      toast.error(message);
    }
  };

  const handleEdit = (acc: SupabaseAccountSafe) => {
    setEditingId(acc.id);
    setLabel(acc.label ?? "");
    setToken(""); // Token is always blank when starting edit for security/UX
    setMaxProjects(acc.max_projects ?? 2);
    setIsAdding(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !label) return;

    try {
      await updateAccount.mutateAsync({
        id: editingId,
        account: {
          label,
          max_projects: maxProjects,
          ...(token ? { management_token: token } : {})
        }
      });
      toast.success("Conta atualizada com sucesso!");
      setEditingId(null);
      resetForm();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao atualizar conta";
      toast.error(message);
    }
  };

  const resetForm = () => {
    setLabel("");
    setToken("");
    setMaxProjects(2);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const isPending = createAccount.isPending || updateAccount.isPending;
  const SubmitIcon = editingId ? Check : Key;

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
        <Button onClick={() => isAdding ? handleCancel() : setIsAdding(true)} variant={isAdding ? "ghost" : "outline"} size="sm">
          {isAdding ? "Cancelar" : <><Plus className="h-4 w-4 mr-2" /> Nova Conta</>}
        </Button>
      </div>

      {(isAdding || editingId) && (
        <form onSubmit={editingId ? handleUpdate : handleAdd} className="mb-6 p-4 border rounded-lg bg-secondary/20 space-y-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">{editingId ? "Editar Conta" : "Adicionar Nova Conta"}</h3>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome Identificador</Label>
              <Input 
                 placeholder="Ex: Minha Conta Pessoal" 
                 value={label}
                 onChange={(e) => setLabel(e.target.value)}
                 required
              />
            </div>
            <div className="space-y-2">
              <Label>Limite de Projetos (Plano)</Label>
              <Input 
                 type="number" 
                 value={maxProjects}
                 onChange={(e) => setMaxProjects(Number.parseInt(e.target.value, 10))}
                 required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Management Token (PAT) {editingId && <span className="text-[10px] text-muted-foreground ml-2">(Deixe em branco para não alterar)</span>}</Label>
            <div className="relative">
              <input type="text" name="username" value="supabase-pat" readOnly className="hidden" aria-hidden="true" tabIndex={-1} />
              <Input 
                type="password"
                autoComplete="new-password"
                placeholder={editingId ? "Manter token atual" : "sbp_..."}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required={!editingId}
              />
            </div>
            {!editingId && <p className="text-xs text-muted-foreground">Este token será validado na API do Supabase ao salvar.</p>}
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <Loader2 className="spin h-4 w-4 mr-2" />
            ) : (
              <SubmitIcon className="mr-2 h-4 w-4" />
            )}
            {editingId ? "Salvar Alterações" : "Validar e Salvar Conta"}
          </Button>
        </form>
      )}

      <div className="space-y-3">
        {accounts.length === 0 && !isAdding && (
          <p className="text-center py-4 text-sm text-muted-foreground italic">Nenhuma conta cadastrada.</p>
        )}
        
        {accounts.map((acc) => (
          <div key={acc.id} className={`flex items-center justify-between p-3 rounded-lg border transition-all ${editingId === acc.id ? 'ring-2 ring-primary bg-primary/5' : 'bg-secondary/10'}`}>
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
                className="text-muted-foreground hover:text-primary transition-colors"
                onClick={() => handleEdit(acc)}
                disabled={!!editingId}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => {
                  if (acc.id && confirm("Remover esta conta? O onboarding de novos clientes com ela falhará.")) {
                    deleteAccount.mutate(acc.id);
                  }
                }}
                disabled={!!editingId}
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
