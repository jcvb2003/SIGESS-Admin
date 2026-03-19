import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { KeyRound, ListChecks, Copy, Check } from "lucide-react";
import { toast } from "sonner";

type LicenseStatus = "active" | "expired" | "waiting";
type LicensePlan = "trial" | "paid";

interface License {
  key: string;
  plan: LicensePlan;
  usage: string;
  device: string;
  expiry: string;
  status: LicenseStatus;
}

const MOCK_LICENSES: License[] = [
  { key: "TRIAL-A1B2-C3D4", plan: "trial", usage: "3 / 5", device: "a3f9d12c...", expiry: "—", status: "active" },
  { key: "SINP-X9K2-M7P1", plan: "paid", usage: "—", device: "b7e2a44f...", expiry: "18/03/2027", status: "active" },
  { key: "TRIAL-E5F6-G7H8", plan: "trial", usage: "5 / 5", device: "c1d8f990...", expiry: "—", status: "expired" },
  { key: "SINP-Q3R4-S5T6", plan: "paid", usage: "—", device: "Não vinculado", expiry: "20/03/2027", status: "waiting" },
];

function rand() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

const statusConfig: Record<LicenseStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Ativo", variant: "default" },
  expired: { label: "Expirado", variant: "destructive" },
  waiting: { label: "Aguardando", variant: "secondary" },
};

const planConfig: Record<LicensePlan, { label: string; className: string }> = {
  trial: { label: "Trial", className: "bg-amber-500/15 text-amber-600 border-amber-500/20 hover:bg-amber-500/15" },
  paid: { label: "Pago", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/15" },
};

export default function LicensesPage() {
  const [licenses] = useState<License[]>(MOCK_LICENSES);
  const [trialUses, setTrialUses] = useState("5");
  const [trialNote, setTrialNote] = useState("");
  const [paidDuration, setPaidDuration] = useState("1");
  const [paidNote, setPaidNote] = useState("");
  const [generatedTrialKey, setGeneratedTrialKey] = useState<string | null>(null);
  const [generatedPaidKey, setGeneratedPaidKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  const handleGenerateTrial = () => {
    const key = `TRIAL-${rand()}-${rand()}`;
    setGeneratedTrialKey(key);
    toast.success("Chave trial gerada!");
  };

  const handleGeneratePaid = () => {
    const key = `SINP-${rand()}-${rand()}`;
    setGeneratedPaidKey(key);
    toast.success("Chave paga gerada!");
  };

  const handleCopy = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("Chave copiada!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleBlock = (key: string) => {
    toast.success(`Licença ${key} bloqueada`);
  };

  const handleRenew = (key: string) => {
    toast.success(`Licença ${key} renovada por +1 ano`);
  };

  const handleConvert = (key: string) => {
    toast.success(`Licença ${key} convertida para plano pago`);
  };

  return (
    <MainLayout>
      <div className="space-y-8 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Licenças</h1>
          <p className="mt-1 text-muted-foreground">Gerenciamento de licenças</p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <Card key={m.label} className="p-4 bg-secondary/50">
              <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
              <p className={`text-2xl font-semibold ${m.color || "text-foreground"}`}>{m.value}</p>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="licenses" className="space-y-6">
          <TabsList className="bg-secondary/50">
            <TabsTrigger value="licenses" className="gap-2">
              <ListChecks className="h-4 w-4" />
              Licenças
            </TabsTrigger>
            <TabsTrigger value="generate" className="gap-2">
              <KeyRound className="h-4 w-4" />
              Gerar chave
            </TabsTrigger>
          </TabsList>

          {/* Licenses Table */}
          <TabsContent value="licenses">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-foreground">Todas as licenças</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chave</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Uso</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {licenses.map((lic) => {
                    const plan = planConfig[lic.plan];
                    const status = statusConfig[lic.status];
                    return (
                      <TableRow key={lic.key}>
                        <TableCell className="font-mono text-xs">{lic.key}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={plan.className}>{plan.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{lic.usage}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground max-w-[120px] truncate">{lic.device}</TableCell>
                        <TableCell className="text-muted-foreground">{lic.expiry}</TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {lic.plan === "paid" && lic.status === "active" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRenew(lic.key)}>
                                Renovar
                              </Button>
                            )}
                            {lic.status === "expired" && lic.plan === "trial" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleConvert(lic.key)}>
                                Converter
                              </Button>
                            )}
                            {lic.status !== "expired" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleBlock(lic.key)}>
                                Bloquear
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Generate Keys */}
          <TabsContent value="generate">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Trial */}
              <Card className="p-5 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Gerar trial</h3>
                <div className="space-y-2">
                  <Label className="text-xs">Usos máximos</Label>
                  <Input type="number" value={trialUses} onChange={(e) => setTrialUses(e.target.value)} min={1} max={20} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Observação (opcional)</Label>
                  <Input placeholder="ex: João da Silva" value={trialNote} onChange={(e) => setTrialNote(e.target.value)} />
                </div>
                <Button className="w-full" onClick={handleGenerateTrial}>Gerar chave trial</Button>
                {generatedTrialKey && (
                  <div className="flex items-center justify-between bg-secondary/50 border border-border rounded-md px-3 py-2">
                    <span className="font-mono text-sm">{generatedTrialKey}</span>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => handleCopy(generatedTrialKey)}>
                      {copiedKey === generatedTrialKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </Card>

              {/* Paid */}
              <Card className="p-5 space-y-4">
                <h3 className="text-sm font-medium text-foreground">Gerar licença paga</h3>
                <div className="space-y-2">
                  <Label className="text-xs">Duração</Label>
                  <Select value={paidDuration} onValueChange={setPaidDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.5">6 meses</SelectItem>
                      <SelectItem value="1">1 ano</SelectItem>
                      <SelectItem value="2">2 anos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Observação (opcional)</Label>
                  <Input placeholder="ex: Empresa XYZ" value={paidNote} onChange={(e) => setPaidNote(e.target.value)} />
                </div>
                <Button className="w-full" onClick={handleGeneratePaid}>Gerar chave paga</Button>
                {generatedPaidKey && (
                  <div className="flex items-center justify-between bg-secondary/50 border border-border rounded-md px-3 py-2">
                    <span className="font-mono text-sm">{generatedPaidKey}</span>
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => handleCopy(generatedPaidKey)}>
                      {copiedKey === generatedPaidKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
