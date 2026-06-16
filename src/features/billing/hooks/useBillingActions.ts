import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeBillingAction } from '../services/billing.service';
import { billingOverviewKey } from './useBillingOverview';

export function useBillingActions(adminClientId: string) {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: billingOverviewKey(adminClientId) });

  const provisionAccount = useMutation({
    mutationFn: (params: {
      customer_name: string;
      customer_email: string;
      customer_cpf_cnpj: string;
      customer_phone?: string;
    }) => invokeBillingAction('provision_account', { admin_client_id: adminClientId, ...params }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao provisionar conta'),
  });

  const startTrial = useMutation({
    mutationFn: (trialDays?: number) =>
      invokeBillingAction('start_trial', {
        admin_client_id: adminClientId,
        ...(trialDays !== undefined ? { trial_days: trialDays } : {}),
      }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao iniciar trial'),
  });

  const createCharge = useMutation({
    mutationFn: (params: {
      amount: number;
      due_date: string;
      description: string;
      type?: string;
      billing_type?: string;
    }) => invokeBillingAction('create_charge', { admin_client_id: adminClientId, ...params }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar cobrança'),
  });

  const generateToken = useMutation({
    mutationFn: (chargeId?: string) =>
      invokeBillingAction('generate_portal_token', {
        admin_client_id: adminClientId,
        ...(chargeId ? { charge_id: chargeId } : {}),
      }),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao gerar token'),
    // Não invalida overview — token é dado efêmero
  });

  const createSubscription = useMutation({
    mutationFn: (params: {
      plan_id: string;
      interval: 'monthly' | 'annual';
      amount: number;
      next_due_date: string;
      description?: string;
    }) => invokeBillingAction('create_subscription', { admin_client_id: adminClientId, ...params }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar assinatura'),
  });

  const syncAccount = useMutation({
    mutationFn: () =>
      invokeBillingAction('sync_account', { admin_client_id: adminClientId }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar'),
  });

  return { provisionAccount, startTrial, createSubscription, createCharge, generateToken, syncAccount };
}
