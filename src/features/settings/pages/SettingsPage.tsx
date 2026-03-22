import { MainLayout } from "@/components/layout/MainLayout";
import { ProfileSettings } from "../components/ProfileSettings";
import { NotificationSettings } from "../components/NotificationSettings";
import { SecuritySettings } from "../components/SecuritySettings";
import { DatabaseSettings } from "../components/DatabaseSettings";

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
          <ProfileSettings />
          <NotificationSettings />
          <SecuritySettings />
          <DatabaseSettings />
        </div>
      </div>
    </MainLayout>
  );
}
