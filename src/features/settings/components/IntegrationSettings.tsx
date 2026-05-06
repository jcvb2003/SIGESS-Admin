import { useState, useEffect } from "react";
import { Link2, Save, Loader2, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSystemSettings, useUpdateSystemSetting } from "../hooks/useSystemSettings";
import { toast } from "sonner";

export function IntegrationSettings() {
  const { data: settings, isLoading } = useSystemSettings();
  const updateSetting = useUpdateSystemSetting();
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings && settings.length > 0) {
      const s = Object.fromEntries(settings.map((st) => [st.key, st.value]));
      if (Object.keys(localSettings).length === 0) {
        setLocalSettings(s);
      }
    }
  }, [settings, localSettings]);

  const handleSave = async (e: React.FormEvent, key: string) => {
    e.preventDefault();
    const newValue = localSettings[key] || "";

    if (newValue === "••••••••") {
      toast.info("Configuração mantida (valor não alterado).");
      return;
    }

    try {
      await updateSetting.mutateAsync({ key, value: newValue });
      toast.success(`${key} atualizado!`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : `Falha ao salvar ${key}`;
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
          <Link2 className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Configurações de Integração</h2>
          <p className="text-sm text-muted-foreground">
            Credenciais globais usadas pelo onboarding e pelos fluxos de email.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4">
          <div className="space-y-4 rounded-lg border bg-secondary/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-500" />
              <span className="font-medium text-sm">Resend (Email)</span>
            </div>

            <form onSubmit={(e) => handleSave(e, "resend_api_key")} className="space-y-2">
              <Label>Resend API Key</Label>
              <div className="flex gap-2">
                <input
                  type="text"
                  name="username"
                  value="resend"
                  readOnly
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={localSettings["resend_api_key"] || ""}
                  placeholder={
                    settings?.find((s) => s.key === "resend_api_key")?.value === "••••••••"
                      ? "Chave configurada"
                      : "Digite a API Key"
                  }
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, resend_api_key: e.target.value }))
                  }
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  disabled={
                    updateSetting.isPending ||
                    localSettings["resend_api_key"] === "••••••••"
                  }
                >
                  <Save
                    className={`h-4 w-4 ${
                      localSettings["resend_api_key"] === "••••••••" ? "opacity-20" : ""
                    }`}
                  />
                </Button>
              </div>
            </form>

            <form onSubmit={(e) => handleSave(e, "resend_from_email")} className="space-y-2">
              <Label>Sender Email (noreply@...)</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={localSettings["resend_from_email"] || ""}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, resend_from_email: e.target.value }))
                  }
                />
                <Button type="submit" size="icon" variant="ghost" disabled={updateSetting.isPending}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>

        <p className="text-center text-xs italic text-muted-foreground">
          As alterações são enviadas e armazenadas de forma segura no seu banco Administrativo.
        </p>
      </div>
    </Card>
  );
}
