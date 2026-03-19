import { User, Bell, Shield, Database } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="mt-1 text-muted-foreground">
            Gerencie as configurações do painel administrativo
          </p>
        </div>

        <div className="grid gap-6 max-w-2xl">
          {/* Profile Section */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Perfil</h2>
                <p className="text-sm text-muted-foreground">
                  Informações da sua conta
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" defaultValue="Administrador" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue="admin@empresa.com" />
                </div>
              </div>
              <Button>Salvar Alterações</Button>
            </div>
          </Card>

          {/* Notifications Section */}
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

          {/* Security Section */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
                <Shield className="h-5 w-5 text-warning" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Segurança</h2>
                <p className="text-sm text-muted-foreground">
                  Configurações de segurança da conta
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha atual</Label>
                <Input id="current-password" type="password" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input id="new-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar senha</Label>
                  <Input id="confirm-password" type="password" />
                </div>
              </div>
              <Button>Alterar Senha</Button>
            </div>
          </Card>

          {/* Database Section */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Banco de Dados</h2>
                <p className="text-sm text-muted-foreground">
                  Configurações do Supabase principal
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-secondary/50 p-4">
                <p className="text-sm text-muted-foreground">
                  O banco de dados está configurado e funcionando corretamente.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-medium text-foreground">Conectado</span>
                </div>
              </div>
              <Button variant="outline">Testar Conexão</Button>
            </div>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
