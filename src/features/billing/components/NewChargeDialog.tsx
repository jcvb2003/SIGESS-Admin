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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBillingActions } from '../hooks';

interface NewChargeDialogProps {
  adminClientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewChargeDialog({ adminClientId, open, onOpenChange }: Readonly<NewChargeDialogProps>) {
  const { createCharge } = useBillingActions(adminClientId);

  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('one_off');
  const [billingType, setBillingType] = useState('BOLETO');

  const reset = () => {
    setAmount('');
    setDueDate('');
    setDescription('');
    setType('one_off');
    setBillingType('BOLETO');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      toast.error('Valor deve ser maior que zero');
      return;
    }
    if (!dueDate) {
      toast.error('Data de vencimento obrigatória');
      return;
    }
    if (!description.trim()) {
      toast.error('Descrição obrigatória');
      return;
    }

    createCharge.mutate(
      { amount: amountCents, due_date: dueDate, description: description.trim(), type, billing_type: billingType },
      {
        onSuccess: () => {
          toast.success('Cobrança criada');
          reset();
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova cobrança avulsa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nc-amount">Valor (R$)</Label>
              <Input
                id="nc-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="99.90"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-due">Vencimento</Label>
              <Input
                id="nc-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nc-desc">Descrição</Label>
            <Input
              id="nc-desc"
              placeholder="Descreva a cobrança"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_off">Avulsa</SelectItem>
                  <SelectItem value="adjustment">Ajuste</SelectItem>
                  <SelectItem value="tier_upgrade">Upgrade</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modalidade</Label>
              <Select value={billingType} onValueChange={setBillingType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOLETO">Boleto</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { reset(); onOpenChange(false); }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createCharge.isPending}>
              {createCharge.isPending ? 'Criando...' : 'Criar cobrança'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
