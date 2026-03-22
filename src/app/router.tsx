import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import Index from "@/features/dashboard/pages/Index";
import AuthPage from "@/features/auth/pages/AuthPage";
import ClientsPage from "@/features/clients/pages/ClientsPage";
import ClientDetailPage from "@/features/clients/pages/ClientDetailPage";
import GlobalPage from "@/features/global/pages/GlobalPage";
import LicensesPage from "@/features/licenses/pages/LicensesPage";
import SettingsPage from "@/features/settings/pages/SettingsPage";
import NotFound from "@/components/shared/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<ProtectedRoute requireAdmin><Index /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute requireAdmin><ClientsPage /></ProtectedRoute>} />
        <Route path="/clients/:id" element={<ProtectedRoute requireAdmin><ClientDetailPage /></ProtectedRoute>} />
        <Route path="/global" element={<ProtectedRoute requireAdmin><GlobalPage /></ProtectedRoute>} />
        <Route path="/licenses" element={<ProtectedRoute requireAdmin><LicensesPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute requireAdmin><SettingsPage /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
