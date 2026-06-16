import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Tenant } from '@/features/clients/types';
import { useBillingActions } from '../hooks';

interface ProvisionAccountDialogProps {
  cliente: Tenant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProvisionAccountDialog({
  cliente,
  open,
  onOpenChange,
}: Readonly<ProvisionAccountDialogProps>) {
  const { provisionAccount } = useBillingActions(cliente.id);

  const [name, setName] = useState(cliente.nome_entidade);
  const [email, setEmail] = useState(cliente.email ?? '');
  const [cpfCnpj, setCpfCnpj] = useState(cliente.cnpj_cpf ?? '');
  const [phone, setPhone] = useState(cliente.telefone ?? '');

  const canSubmit = name.trim() && email.trim() && cpfCnpj.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    provisionAccount.mutate(
      {
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_cpf_cnpj: cpfCnpj.trim(),
        ...(phone.trim() ? { customer_phone: phone.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Conta de cobrança provisionada');
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Provisionar conta de cobrança</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prov-name">Nome do cliente</Label>
            <Input
              id="prov-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="prov-email">
                E-mail <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prov-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com.br"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-cpf">
                CPF / CNPJ <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prov-cpf"
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prov-phone">Telefone (opcional)</Label>
            <Input
              id="prov-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(99) 99999-9999"
            />
          </div>

          {(!cliente.email || !cliente.cnpj_cpf) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              E-mail e/ou CPF/CNPJ não cadastrados neste cliente — preencha antes de provisionar.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit || provisionAccount.isPending}>
              {provisionAccount.isPending ? 'Provisionando...' : 'Provisionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
