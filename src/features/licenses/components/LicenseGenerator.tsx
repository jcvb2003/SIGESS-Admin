import { useState } from "react";
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
import { Loader2, Copy, Check } from "lucide-react";
import { useCreateLicense } from "../hooks";
import { toast } from "sonner";

export function LicenseGenerator() {
  const [trialUses, setTrialUses] = useState("5");
  const [trialDays, setTrialDays] = useState("3");
  const [paidDuration, setPaidDuration] = useState("1");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  const createMutation = useCreateLicense();

  function generateRand() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  const handleCopy = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    toast.success("Chave copiada!");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateTrial = async () => {
    const key = `TRIAL-${generateRand()}-${generateRand()}`;
    const days = parseInt(trialDays) || 3;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    await createMutation.mutateAsync({
      key,
      plan: "trial",
      status: "active",
      max_usage: parseInt(trialUses) || 5,
      expires_at: expiresAt.toISOString(),
    });

    setGeneratedKey(key);
  };

  const handleGeneratePaid = async () => {
    const key = `SINP-${generateRand()}-${generateRand()}`;
    const months = parseFloat(paidDuration) * 12;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);

    await createMutation.mutateAsync({
      key,
      plan: "paid",
      status: "active",
      expires_at: expiresAt.toISOString(),
    });

    setGeneratedKey(key);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Trial */}
      <Card className="p-5 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Gerar trial</h3>
        <div className="space-y-2">
          <Label className="text-xs">Usos máximos</Label>
          <Input type="number" value={trialUses} onChange={(e) => setTrialUses(e.target.value)} min={1} max={20} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Duração (dias)</Label>
          <Select value={trialDays} onValueChange={setTrialDays}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <SelectItem key={d} value={String(d)}>{d} {d === 1 ? "dia" : "dias"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="w-full" onClick={handleGenerateTrial} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Gerar chave trial
        </Button>
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
        <Button className="w-full" onClick={handleGeneratePaid} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Gerar chave paga
        </Button>
      </Card>

      {generatedKey && (
        <Card className="md:col-span-2 p-4 bg-primary/5 border-primary/20 flex items-center justify-between">
          <div>
            <p className="text-xs text-primary font-medium mb-1">Última chave gerada:</p>
            <span className="font-mono text-lg font-bold text-primary">{generatedKey}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => handleCopy(generatedKey)}>
            {copiedKey === generatedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </Card>
      )}
    </div>
  );
}
