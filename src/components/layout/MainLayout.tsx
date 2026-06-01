import { ReactNode } from "react";
import { AppNavbar } from "./AppNavbar";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <AppNavbar />
      <main className="flex-1 overflow-y-auto">
        <div className="container max-w-7xl py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
