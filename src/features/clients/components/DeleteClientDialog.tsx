import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { verifyPassword } from "@/services/clients.service";

interface DeleteClientDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => Promise<void>;
  readonly clientName: string;
}

export function DeleteClientDialog({ 
  open, 
  onOpenChange, 
  onConfirm, 
  clientName 
}: DeleteClientDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (confirmName !== clientName) {
      toast.error("O nome do cliente não confere.");
      return;
    }

    if (!password) {
      toast.error("A senha é obrigatória.");
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Verificar senha
      await verifyPassword(password);
      
      // 2. Executar deleção
      await onConfirm();
      
      toast.success("Cliente excluído com sucesso.");
      onOpenChange(false);
      setPassword("");
      setConfirmName("");
    } catch (error) {
      const err = error as Error;
      toast.error(err.message || "Erro ao excluir cliente.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Excluir Cliente
          </DialogTitle>
          <DialogDescription>
            Esta ação é irreversível. Todos os dados do projeto Supabase vinculados a este cliente no Admin serão removidos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleConfirm} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="confirmName">
              Digite <span className="font-bold select-none">{clientName}</span> para confirmar:
            </Label>
            <Input
              id="confirmName"
              placeholder="Digite o nome do cliente"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Sua Senha de Administrador:</Label>
            <Input
              id="password"
              type="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isDeleting || confirmName !== clientName || !password}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Confirmar Exclusão"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
