import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { UserPlus, Copy, Check, Lock, Mail, Eye, EyeOff } from "lucide-react";
import { proxyAction } from "@/services/clients.service";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

interface AddClientUserDialogProps {
  readonly clientId: string;
  readonly onUserAdded: () => void;
}

export function AddClientUserDialog({ clientId, onUserAdded }: AddClientUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [usePassword, setUsePassword] = useState(false);
  const [role, setRole] = useState("user");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setInviteLink(null);

    try {
      const payload = { 
        email, 
        role,
        ...(usePassword ? { password, autoConfirm } : {})
      };

      const result = await proxyAction(clientId, "create-client-member", payload);
      
      const successMsg = usePassword 
        ? `Usuário ${email} criado com sucesso!` 
        : `Um convite foi enviado para ${email}.`;

      toast({
        title: "Sucesso!",
        description: successMsg,
      });

      if (result.inviteLink && !usePassword) {
        setInviteLink(result.inviteLink);
      } else {
        setOpen(false);
        onUserAdded();
      }
    } catch (error) {
      toast({
        title: "Erro ao criar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copiado!" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setInviteLink(null);
        setEmail("");
        setPassword("");
        setUsePassword(false);
      }
    }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Novo Usuário do Cliente</DialogTitle>
          <DialogDescription>
            Escolha entre enviar um link de convite ou definir uma senha manualmente.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 py-4">
            <Alert className="bg-primary/5 border-primary/20 text-primary">
              <Check className="h-4 w-4" />
              <AlertTitle>Convite Criado!</AlertTitle>
              <AlertDescription>
                O convite para <strong>{email}</strong> foi gerado. Copie o link abaixo para enviar manualmente.
              </AlertDescription>
            </Alert>
            
            <div className="flex items-center gap-2 mt-2">
              <Input value={inviteLink} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copyToClipboard}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            
            <DialogFooter>
              <Button className="w-full" onClick={() => {
                setOpen(false);
                onUserAdded();
              }}>
                Fechar e Atualizar Lista
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleAdd} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail do Usuário</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="exemplo@sigess.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Nível de Acesso (Role)</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o acesso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador (Total)</SelectItem>
                  <SelectItem value="user">Auxiliar (Restrito)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="my-2" />

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="usePassword" 
                  checked={usePassword} 
                  onCheckedChange={(checked) => setUsePassword(!!checked)} 
                />
                <Label htmlFor="usePassword" className="text-sm font-medium leading-none cursor-pointer">
                  Definir senha manualmente
                </Label>
              </div>

              {usePassword && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha Temporária</Label>
                    <div className="relative">
                      <Input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required={usePassword}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 bg-muted/50 p-3 rounded-md border border-dashed">
                    <Checkbox 
                      id="autoConfirm" 
                      checked={autoConfirm} 
                      onCheckedChange={(checked) => setAutoConfirm(!!checked)} 
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label htmlFor="autoConfirm" className="text-sm font-bold cursor-pointer">
                        Auto Confirmar Usuário
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Não enviará e-mail de confirmação. O usuário poderá logar imediatamente.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="submit" disabled={loading} className="w-full gap-2">
                {loading ? (
                  "Processando..."
                ) : (
                  <>
                    {usePassword ? <Lock className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                    {usePassword ? "Criar Usuário" : "Enviar Convite"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
