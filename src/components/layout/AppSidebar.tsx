import { useState, useEffect } from "react";
import { Home, Users, Globe, KeyRound, Settings, Database, LogOut } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase";

const navigation = [
  { name: "Início", href: "/", icon: Home },
  { name: "Clientes", href: "/clients", icon: Users, showCount: true },
  { name: "Observabilidade", href: "/observability", icon: Globe },
  { name: "Licenças", href: "/licenses", icon: KeyRound },
  { name: "Configurações", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [clientCount, setClientCount] = useState(0);

  useEffect(() => {
    fetchClientCount();
  }, []);

  const fetchClientCount = async () => {
    try {
      const { count, error } = await supabase
        .from("entidades")
        .select("*", { count: "exact", head: true });

      if (!error && count !== null) {
        setClientCount(count);
      }
    } catch (error) {
      console.error("Error fetching client count:", error);
    }
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">Admin Panel</span>
          <span className="text-xs text-muted-foreground">Multi-Client Supabase</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href !== "/" && location.pathname.startsWith(item.href));
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.name}</span>
              {item.showCount && clientCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-xs font-medium text-primary">
                  {clientCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
              <span className="text-sm font-medium text-foreground">
                {user?.email?.charAt(0).toUpperCase() || "A"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {user?.email?.split("@")[0] || "Admin"}
              </span>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {user?.email || "admin@empresa.com"}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </aside>
  );
}
