import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  className?: string;
}

export function StatsCard({ title, value, subtitle, icon: Icon, className }: StatsCardProps) {
  return (
    <Card className={cn("p-6 hover:border-primary/30 transition-all duration-300", className)}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="mt-4">
        <p className="text-3xl font-bold text-foreground">{value}</p>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Card>
  );
}
