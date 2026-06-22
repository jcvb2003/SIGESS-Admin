import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import Index from "@/features/dashboard/pages/Index";
import AuthPage from "@/features/auth/pages/AuthPage";
import ProjectsPage from "@/features/clients/pages/ProjectsPage";
import ProjectDetailPage from "@/features/clients/pages/ProjectDetailPage";
import ClienteDetailPage from "@/features/clients/pages/ClienteDetailPage";
import BillingDetailPage from "@/features/billing/pages/BillingDetailPage";
import BillingOverviewPage from "@/features/billing/pages/BillingOverviewPage";
import ObservabilityPage from "@/features/observability/pages/ObservabilityPage";
import LicensesPage from "@/features/licenses/pages/LicensesPage";
import SettingsPage from "@/features/settings/pages/SettingsPage";
import NotFound from "@/components/shared/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<ProtectedRoute requireAdmin><Index /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute requireAdmin><ProjectsPage /></ProtectedRoute>} />
        <Route path="/clients/:id">
          <Route index element={<ProtectedRoute requireAdmin><ProjectDetailPage /></ProtectedRoute>} />
          <Route path="clientes/:clienteId" element={<ProtectedRoute requireAdmin><ClienteDetailPage /></ProtectedRoute>} />
          <Route path="clientes/:clienteId/billing" element={<ProtectedRoute requireAdmin><BillingDetailPage /></ProtectedRoute>} />
        </Route>
        <Route path="/billing" element={<ProtectedRoute requireAdmin><BillingOverviewPage /></ProtectedRoute>} />
        <Route path="/observability" element={<ProtectedRoute requireAdmin><ObservabilityPage /></ProtectedRoute>} />
        <Route path="/licenses" element={<ProtectedRoute requireAdmin><LicensesPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute requireAdmin><SettingsPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
