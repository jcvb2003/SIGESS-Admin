import { Card } from "@/components/ui/card";
import { License } from "../types";

interface LicenseMetricsProps {
  licenses: License[];
}

export function LicenseMetrics({ licenses }: LicenseMetricsProps) {
  const totalLicenses = licenses.length;
  const activeTrials = licenses.filter((l) => l.plan === "trial" && l.status === "active").length;
  const paidPlans = licenses.filter((l) => l.plan === "paid").length;
  const expiredCount = licenses.filter((l) => l.status === "expired").length;

  const metrics = [
    { label: "Total de licenças", value: totalLicenses, color: "" },
    { label: "Trials ativos", value: activeTrials, color: "text-amber-500" },
    { label: "Planos pagos", value: paidPlans, color: "text-emerald-500" },
    { label: "Expirados", value: expiredCount, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <Card key={m.label} className="p-4 bg-secondary/50">
          <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
          <p className={`text-2xl font-semibold ${m.color || "text-foreground"}`}>{m.value}</p>
        </Card>
      ))}
    </div>
  );
}
