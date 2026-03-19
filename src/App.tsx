import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ClientsPage from "./pages/ClientsPage";
import ClientDetailPage from "./pages/ClientDetailPage";
import GlobalPage from "./pages/GlobalPage";
import LicensesPage from "./pages/LicensesPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute requireAdmin>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients"
              element={
                <ProtectedRoute requireAdmin>
                  <ClientsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients/:id"
              element={
                <ProtectedRoute requireAdmin>
                  <ClientDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/global"
              element={
                <ProtectedRoute requireAdmin>
                  <GlobalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/licenses"
              element={
                <ProtectedRoute requireAdmin>
                  <LicensesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute requireAdmin>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;