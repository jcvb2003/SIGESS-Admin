import { useState } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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

type ClientFormState = ClientCreate & { acesso_expira_em: string | null };

const initialState: ClientFormState = {
  nome_entidade: "",
  tenant_code: "",
  deployment_mode: "isolated",
  shared_project_ref: "",
  shared_tenant_id: "",
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
};

export function AddClientModal({ open, onOpenChange }: AddClientModalProps) {
  const [formData, setFormData] = useState<ClientFormState>(initialState);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [connectionDetails, setConnectionDetails] = useState<{
    hasStorage: boolean;
    hasAuth: boolean;
  } | null>(null);

  const createClientMutation = useCreateClient();

  const handleChange = (field: keyof ClientFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setConnectionStatus("idle");
    setConnectionDetails(null);
  };

  const testConnection = async () => {
    if (
      !formData.supabase_url ||
      !formData.supabase_publishable_key ||
      !formData.supabase_secret_keys
    ) {
      toast.error("Preencha a URL e as chaves do Supabase");
      return;
    }

    setTesting(true);
    setConnectionStatus("idle");
    setConnectionDetails(null);

    try {
      const result = await testSupabaseConnection(
        formData.supabase_url,
        formData.supabase_publishable_key,
        formData.supabase_secret_keys || "",
      );

      if (result.success) {
        setConnectionStatus("success");
        setConnectionDetails(result.details || null);
        toast.success(result.message);
      } else {
        setConnectionStatus("error");
        toast.error(result.message);
      }
    } catch (error) {
      const err = error as Error;
      setConnectionStatus("error");
      toast.error(`Falha ao testar conexao: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.nome_entidade ||
      !formData.tenant_code ||
      !formData.supabase_url ||
      !formData.supabase_publishable_key ||
      !formData.telefone
    ) {
      toast.error("Preencha todos os campos obrigatorios");
      return;
    }

    if (formData.deployment_mode === "isolated" && !formData.supabase_secret_keys) {
      toast.error("A chave service_role e obrigatoria para tenants isolated");
      return;
    }

    if (formData.deployment_mode === "shared" && !formData.shared_project_ref.trim()) {
      toast.error("Informe o project ref do ambiente shared");
      return;
    }

    try {
      let acessoExpiraEm: string | null = null;
      if (
        (formData.assinatura === "trial" || formData.assinatura === "anual") &&
        formData.acesso_expira_em
      ) {
        acessoExpiraEm = new Date(formData.acesso_expira_em).toISOString();
      }

      const payload: ClientCreate = {
        ...formData,
        tenant_code: formData.tenant_code.trim().toLowerCase(),
        shared_project_ref: formData.shared_project_ref.trim() || null,
        shared_tenant_id: formData.shared_tenant_id.trim() || null,
        acesso_expira_em: acessoExpiraEm,
        max_socios: formData.assinatura === "trial" ? formData.max_socios : null,
      };

      await createClientMutation.mutateAsync(payload);
      toast.success("Cliente adicionado com sucesso!");
      onOpenChange(false);
      setFormData(initialState);
      setConnectionStatus("idle");
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
            Adicione um novo tenant e defina se ele opera em modo isolated ou shared.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label htmlFor="nome_entidade">Nome da Entidade *</Label>
            <Input
              id="nome_entidade"
              placeholder="Ex: Sindicato dos Pescadores"
              value={formData.nome_entidade}
              onChange={(e) => handleChange("nome_entidade", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tenant_code">Tenant Code *</Label>
            <Input
              id="tenant_code"
              placeholder="Ex: sinpesca-oeiras"
              value={formData.tenant_code}
              onChange={(e) => handleChange("tenant_code", e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Identificador publico e critico para resolucao dinamica no Web. Use apenas
              letras minusculas, numeros e hifen.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deployment_mode">Modo de Implantacao</Label>
            <Select
              value={formData.deployment_mode}
              onValueChange={(value) => handleChange("deployment_mode", value)}
            >
              <SelectTrigger id="deployment_mode">
                <SelectValue placeholder="Selecione o modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="isolated">Isolated</SelectItem>
                <SelectItem value="shared">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="contato@sindicato.com"
                value={formData.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input
                id="telefone"
                placeholder="(89) 99999-9999"
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
            <Label htmlFor="supabase_publishable_key">Chave Publica (anon) *</Label>
            <Input
              id="supabase_publishable_key"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={formData.supabase_publishable_key || ""}
              onChange={(e) => handleChange("supabase_publishable_key", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shared_project_ref">
              Shared Project Ref {formData.deployment_mode === "shared" ? "*" : ""}
            </Label>
            <Input
              id="shared_project_ref"
              placeholder="Ex: jmahgvgtjstklabwkkit"
              value={formData.shared_project_ref || ""}
              onChange={(e) => handleChange("shared_project_ref", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shared_tenant_id">Shared Tenant ID</Label>
            <Input
              id="shared_tenant_id"
              placeholder="UUID do tenant no banco shared"
              value={formData.shared_tenant_id || ""}
              onChange={(e) => handleChange("shared_tenant_id", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supabase_secret_keys">
              Chave Secreta (service_role) {formData.deployment_mode === "isolated" ? "*" : ""}
            </Label>
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
                Testando conexao...
              </>
            )}
            {!testing && connectionStatus === "success" && (
              <>
                <CheckCircle className="mr-2 h-4 w-4 text-primary" />
                Conexao OK
              </>
            )}
            {!testing && connectionStatus === "error" && (
              <>
                <XCircle className="mr-2 h-4 w-4 text-destructive" />
                Falha na conexao
              </>
            )}
            {!testing && connectionStatus === "idle" && "Testar Conexao"}
          </Button>

          {connectionDetails && (
            <div className="text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg">
              <p>Storage: {connectionDetails.hasStorage ? "Acessivel" : "Sem acesso"}</p>
              <p>Auth: {connectionDetails.hasAuth ? "Acessivel" : "Sem acesso"}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="supabase_access_token" className="flex items-center gap-2">
              Supabase Access Token (PAT)
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
              onValueChange={(value) => {
                const planType = value as "mensal" | "anual" | "trial";
                let newExpiraEm = formData.acesso_expira_em;

                if (planType === "anual") {
                  const nextYear = new Date();
                  nextYear.setFullYear(nextYear.getFullYear() + 1);
                  const pad = (n: number) => n.toString().padStart(2, "0");
                  newExpiraEm = `${nextYear.getFullYear()}-${pad(nextYear.getMonth() + 1)}-${pad(nextYear.getDate())}T${pad(nextYear.getHours())}:${pad(nextYear.getMinutes())}`;
                }

                setFormData((prev) => ({
                  ...prev,
                  assinatura: planType,
                  acesso_expira_em: newExpiraEm,
                }));
              }}
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

          {(formData.assinatura === "trial" || formData.assinatura === "anual") && (
            <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <p className="text-xs font-semibold text-primary uppercase">
                {formData.assinatura === "trial"
                  ? "Configuracoes do Trial"
                  : "Configuracoes do Plano Anual"}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="acesso_expira_em">Data de Expiracao</Label>
                  <Input
                    id="acesso_expira_em"
                    type="datetime-local"
                    value={formData.acesso_expira_em || ""}
                    onChange={(e) => handleChange("acesso_expira_em", e.target.value)}
                  />
                </div>
                {formData.assinatura === "trial" && (
                  <div className="space-y-2">
                    <Label htmlFor="max_socios">Limite de Socios</Label>
                    <Input
                      id="max_socios"
                      type="number"
                      min={1}
                      value={formData.max_socios ?? 5}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          max_socios: Number.parseInt(e.target.value, 10) || 5,
                        }))
                      }
                    />
                  </div>
                )}
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
                ((formData.assinatura === "trial" || formData.assinatura === "anual") &&
                  !formData.acesso_expira_em)
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
