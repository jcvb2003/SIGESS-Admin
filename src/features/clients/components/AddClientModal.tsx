import { useState } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { testSupabaseConnection } from "../utils/testConnection";
import { useCreateClient } from "../hooks/useClientMutations";
import type { ClientCreate } from "../types";

interface AddClientModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function AddClientModal({ open, onOpenChange }: AddClientModalProps) {
  const [formData, setFormData] = useState<ClientCreate & { acesso_expira_em: string | null }>({
    nome_entidade: "",
    email: "",
    telefone: "",
    supabase_url: "",
    supabase_publishable_key: "",
    supabase_secret_keys: "",
    supabase_access_token: "",
    logo_url: "",
    assinatura: "mensal",
    acesso_expira_em: null,
    max_socios: 5,
  });
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionDetails, setConnectionDetails] = useState<{ hasStorage: boolean; hasAuth: boolean } | null>(null);
  
  const createClientMutation = useCreateClient();

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setConnectionStatus('idle');
    setConnectionDetails(null);
  };

  const testConnection = async () => {
    if (!formData.supabase_url || !formData.supabase_publishable_key || !formData.supabase_secret_keys) {
      toast.error("Preencha a URL e as chaves do Supabase");
      return;
    }

    setTesting(true);
    setConnectionStatus('idle');
    setConnectionDetails(null);

    try {
      const result = await testSupabaseConnection(
        formData.supabase_url,
        formData.supabase_publishable_key,
        formData.supabase_secret_keys || ""
      );

      if (result.success) {
        setConnectionStatus('success');
        setConnectionDetails(result.details || null);
        toast.success(result.message);
      } else {
        setConnectionStatus('error');
        toast.error(result.message);
      }
    } catch (error) {
      const err = error as Error;
      setConnectionStatus('error');
      toast.error("Falha ao testar conexão: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome_entidade || !formData.supabase_url || !formData.supabase_publishable_key || !formData.supabase_secret_keys || !formData.telefone) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      let acesso_expira_em: string | null = null;
      if (formData.assinatura === "trial" && formData.acesso_expira_em) {
        acesso_expira_em = new Date(formData.acesso_expira_em).toISOString();
      }

      const payload: ClientCreate = {
        ...formData,
        acesso_expira_em,
        max_socios: formData.assinatura === "trial" ? formData.max_socios : null,
      };
      await createClientMutation.mutateAsync(payload);
      toast.success("Cliente adicionado com sucesso!");
      onOpenChange(false);
      setFormData({
        nome_entidade: "",
        email: "",
        telefone: "",
        supabase_url: "",
        supabase_publishable_key: "",
        supabase_secret_keys: "",
        supabase_access_token: "",
        logo_url: "",
        assinatura: "mensal",
        acesso_expira_em: null,
        max_socios: 5,
      });
      setConnectionStatus('idle');
      setConnectionDetails(null);
    } catch (error) {
      console.error("Erro ao adicionar cliente:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Novo Cliente</DialogTitle>
          <DialogDescription>
            Adicione um novo projeto Supabase de cliente
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label htmlFor="nome_entidade">Nome da Entidade *</Label>
            <Input
              id="nome_entidade"
              placeholder="Ex: Empresa ABC"
              value={formData.nome_entidade}
              onChange={(e) => handleChange("nome_entidade", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="contato@empresa.com"
                value={formData.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input
                id="telefone"
                placeholder="(11) 99999-9999"
                value={formData.telefone || ""}
                onChange={(e) => handleChange("telefone", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supabase_url">URL do Supabase *</Label>
            <Input
              id="supabase_url"
              placeholder="https://xxx.supabase.co"
              value={formData.supabase_url}
              onChange={(e) => handleChange("supabase_url", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supabase_publishable_key">Chave Pública (anon) *</Label>
            <Input
              id="supabase_publishable_key"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={formData.supabase_publishable_key || ""}
              onChange={(e) => handleChange("supabase_publishable_key", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supabase_secret_keys">Chave Secreta (service_role) *</Label>
            <Input
              id="supabase_secret_keys"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={formData.supabase_secret_keys || ""}
              onChange={(e) => handleChange("supabase_secret_keys", e.target.value)}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={testConnection}
            disabled={testing}
          >
            {testing && (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testando conexão...
              </>
            )}
            {!testing && connectionStatus === 'success' && (
              <>
                <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                Conexão OK
              </>
            )}
            {!testing && connectionStatus === 'error' && (
              <>
                <XCircle className="mr-2 h-4 w-4 text-destructive" />
                Falha na conexão
              </>
            )}
            {!testing && connectionStatus === 'idle' && "Testar Conexão"}
          </Button>

          {connectionDetails && (
            <div className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg">
              <p>✓ Storage: {connectionDetails.hasStorage ? "Acessível" : "Sem acesso"}</p>
              <p>✓ Auth: {connectionDetails.hasAuth ? "Acessível" : "Sem acesso"}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="supabase_access_token" className="flex items-center gap-2">
              Supabase Access Token (PAT){" "}
              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold uppercase">
                Acesso Conta Completa
              </span>
            </Label>
            <Input
              id="supabase_access_token"
              type="password"
              placeholder="sbp_..."
              value={formData.supabase_access_token || ""}
              onChange={(e) => handleChange("supabase_access_token", e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Necessário para migrações de schema. Este token dá acesso administrativo a TODOS os projetos da conta Supabase do cliente.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo_url">URL do Logo</Label>
            <Input
              id="logo_url"
              placeholder="https://exemplo.com/logo.png"
              value={formData.logo_url || ""}
              onChange={(e) => handleChange("logo_url", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assinatura">Plano de Assinatura</Label>
            <Select
              value={formData.assinatura}
              onValueChange={(value) => handleChange("assinatura", value as 'mensal' | 'anual' | 'trial')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.assinatura === "trial" && (
            <div className="space-y-3 p-3 rounded-lg border border-yellow-200 bg-yellow-50/50">
              <p className="text-xs font-semibold text-yellow-800 uppercase">Configurações do Trial</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="acesso_expira_em">Data de Expiração</Label>
                  <Input
                    id="acesso_expira_em"
                    type="datetime-local"
                    value={formData.acesso_expira_em || ""}
                    onChange={(e) => handleChange("acesso_expira_em", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_socios">Limite de Sócios</Label>
                  <Input
                    id="max_socios"
                    type="number"
                    min={1}
                    value={formData.max_socios ?? 5}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_socios: Number.parseInt(e.target.value) || 5 }))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={
                createClientMutation.isPending ||
                (formData.assinatura === "trial" && !formData.acesso_expira_em)
              }
            >
              {createClientMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adicionando...
                </>
              ) : (
                "Adicionar Cliente"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
