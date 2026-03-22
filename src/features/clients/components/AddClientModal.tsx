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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddClientModal({ open, onOpenChange }: AddClientModalProps) {
  const [formData, setFormData] = useState<ClientCreate>({
    nome_entidade: "",
    email: "",
    telefone: "",
    supabase_url: "",
    supabase_publishable_key: "",
    supabase_secret_keys: "",
    logo_url: "",
    assinatura: "mensal",
  });
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionDetails, setConnectionDetails] = useState<{ hasStorage: boolean; hasAuth: boolean } | null>(null);
  
  const createClientMutation = useCreateClient();

  const handleChange = (field: keyof ClientCreate, value: string) => {
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
    } catch (error: any) {
      setConnectionStatus('error');
      toast.error("Falha ao testar conexão: " + error.message);
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
      await createClientMutation.mutateAsync(formData);
      toast.success("Cliente adicionado com sucesso!");
      onOpenChange(false);
      setFormData({
        nome_entidade: "",
        email: "",
        telefone: "",
        supabase_url: "",
        supabase_publishable_key: "",
        supabase_secret_keys: "",
        logo_url: "",
        assinatura: "mensal",
      });
      setConnectionStatus('idle');
      setConnectionDetails(null);
    } catch (error: any) {
      // Erro já é tratado pelo toast no error.handler se configurado, 
      // ou podemos tratar aqui se necessário.
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
            {testing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testando conexão...
              </>
            ) : connectionStatus === 'success' ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                Conexão OK
              </>
            ) : connectionStatus === 'error' ? (
              <>
                <XCircle className="mr-2 h-4 w-4 text-destructive" />
                Falha na conexão
              </>
            ) : (
              "Testar Conexão"
            )}
          </Button>

          {connectionDetails && (
            <div className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg">
              <p>✓ Storage: {connectionDetails.hasStorage ? "Acessível" : "Sem acesso"}</p>
              <p>✓ Auth: {connectionDetails.hasAuth ? "Acessível" : "Sem acesso"}</p>
            </div>
          )}

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
              onValueChange={(value) => handleChange("assinatura", value as 'mensal' | 'anual')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={createClientMutation.isPending}>
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
