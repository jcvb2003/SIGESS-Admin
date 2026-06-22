import { Home, Users, Globe, KeyRound, Settings, Database, LogOut, CreditCard } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase";

const navigation = [
  { name: "Início",          href: "/",              icon: Home },
  { name: "Projetos",        href: "/clients",       icon: Users },
  { name: "Billing",         href: "/billing",       icon: CreditCard },
  { name: "Observabilidade", href: "/observability", icon: Globe },
  { name: "Licenças",        href: "/licenses",      icon: KeyRound },
  { name: "Configurações",   href: "/settings",      icon: Settings },
];

export function AppNavbar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border bg-background px-6 gap-6">
      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
          <Database className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-semibold text-foreground">Admin Panel</span>
      </div>

      {/* Nav links */}
      <nav className="flex items-center gap-1 flex-1">
        {navigation.map((item) => {
          const isActive =
            location.pathname === item.href ||
            (item.href !== "/" && location.pathname.startsWith(item.href));

          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      {/* User + logout */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground">
            {user?.email?.charAt(0).toUpperCase() ?? "A"}
          </div>
          <span className="text-sm text-muted-foreground hidden sm:block">
            {user?.email?.split("@")[0] ?? "Admin"}
          </span>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
