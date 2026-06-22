import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeBillingAction } from '../services/billing.service';
import { billingOverviewKey } from './useBillingOverview';
import type { CommercialMode } from '../types';

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

  const changeSubscriptionPlan = useMutation({
    mutationFn: (params: {
      plan_id: string;
      interval: 'monthly' | 'annual';
      amount: number;
      next_due_date: string;
      description?: string;
      update_pending_payments?: boolean;
    }) => invokeBillingAction('change_subscription_plan', { admin_client_id: adminClientId, ...params }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao trocar plano'),
  });

  const cancelCharge = useMutation({
    mutationFn: (providerChargeId: string) =>
      invokeBillingAction('cancel_charge', { provider_charge_id: providerChargeId }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao cancelar cobrança'),
  });

  const syncAccount = useMutation({
    mutationFn: () =>
      invokeBillingAction('sync_account', { admin_client_id: adminClientId }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar'),
  });

  const clearPlannedPlan = useMutation({
    mutationFn: () =>
      invokeBillingAction('clear_planned_plan', { admin_client_id: adminClientId }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao cancelar agendamento'),
  });

  const updateCommercialMode = useMutation({
    mutationFn: (mode: CommercialMode) =>
      invokeBillingAction('update_commercial_mode', { admin_client_id: adminClientId, commercial_mode: mode }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao atualizar modo'),
  });

  const setBillingBlock = useMutation({
    mutationFn: (reason: 'billing_delinquent' | 'manual_suspend') =>
      invokeBillingAction('set_billing_block', { admin_client_id: adminClientId, reason }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao bloquear acesso'),
  });

  const clearBillingBlock = useMutation({
    mutationFn: () =>
      invokeBillingAction('clear_billing_block', { admin_client_id: adminClientId }),
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao desbloquear acesso'),
  });

  return { provisionAccount, createSubscription, changeSubscriptionPlan, createCharge, cancelCharge, generateToken, syncAccount, clearPlannedPlan, updateCommercialMode, setBillingBlock, clearBillingBlock };
}
