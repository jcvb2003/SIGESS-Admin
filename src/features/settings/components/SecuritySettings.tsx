import { Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SecuritySettings() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
          <Shield className="h-5 w-5 text-warning" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Segurança</h2>
          <p className="text-sm text-muted-foreground">
            Configurações de segurança da conta
          </p>
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-password">Senha atual</Label>
          <Input id="current-password" type="password" autoComplete="current-password" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha</Label>
            <Input id="new-password" type="password" autoComplete="new-password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar senha</Label>
            <Input id="confirm-password" type="password" autoComplete="new-password" />
          </div>
        </div>
        <Button type="submit">Alterar Senha</Button>
      </form>
    </Card>
  );
}
