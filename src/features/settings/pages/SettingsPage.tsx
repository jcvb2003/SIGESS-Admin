import { MainLayout } from "@/components/layout/MainLayout";
import { GovernanceSettings } from "../components/GovernanceSettings";
import { SecuritySettings } from "../components/SecuritySettings";
import { SupabaseAccountsSettings } from "../components/SupabaseAccountsSettings";
import { IntegrationSettings } from "../components/IntegrationSettings";
import { BillingPlansSettings } from "../components/BillingPlansSettings";
import { BillingProviderSettings } from "../components/BillingProviderSettings";

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
          <GovernanceSettings />
          <BillingPlansSettings />
          <BillingProviderSettings />
          <SecuritySettings />
          <SupabaseAccountsSettings />
          <IntegrationSettings />
        </div>
      </div>
    </MainLayout>
  );
}
