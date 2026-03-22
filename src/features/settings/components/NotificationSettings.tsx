import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export function NotificationSettings() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/20">
          <Bell className="h-5 w-5 text-info" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Notificações</h2>
          <p className="text-sm text-muted-foreground">
            Configure suas preferências de notificação
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Novos clientes</p>
            <p className="text-sm text-muted-foreground">
              Receber notificação quando um novo cliente é adicionado
            </p>
          </div>
          <Switch defaultChecked />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Expiração de assinatura</p>
            <p className="text-sm text-muted-foreground">
              Alertas sobre assinaturas próximas do vencimento
            </p>
          </div>
          <Switch defaultChecked />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Limite de storage</p>
            <p className="text-sm text-muted-foreground">
              Notificar quando um cliente atingir 80% do storage
            </p>
          </div>
          <Switch defaultChecked />
        </div>
      </div>
    </Card>
  );
}
