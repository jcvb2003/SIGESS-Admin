import type { MemberCharge, CollectionWebhookEvent } from './types.ts';

// ─── Input types ──────────────────────────────────────────────────────────────

export interface EnsureMemberCustomerInput {
  tenantId: string;   // usado pelo adapter para compor chave estável: `${tenantId}:${cpf}`
  nome: string;
  cpf: string;        // limpo (só dígitos)
  email?: string;
  telefone?: string;
}

export interface CreateMemberChargeInput {
  providerCustomerId: string;
  amount: number;
  dueDate: string;              // YYYY-MM-DD
  billingType: 'BOLETO' | 'PIX';
  description: string;          // ex: "Mensalidade Jun/2026 - JOAO SILVA"
  // financeiro_cobrancas_externas.id — chave para o webhook achar o registro local
  // DIFERENTE do externalReference do customer (que é ${tenantId}:${cpf})
  externalReference: string;
}

// ─── Contract ─────────────────────────────────────────────────────────────────

export interface ICollectionProvider {
  readonly name: string;  // 'asaas' — persistido em financeiro_cobrancas_externas.provider

  // Idempotente: cria ou atualiza o customer Asaas para o sócio
  // Adapter computa internamente: externalReference = `${tenantId}:${cpf}`
  // Fluxo: lookup por externalReference → update se encontrado → create se não
  ensureCustomer(input: EnsureMemberCustomerInput): Promise<{ providerId: string }>;

  // Cria cobrança no provider; externalReference liga de volta ao registro local
  createCharge(input: CreateMemberChargeInput): Promise<MemberCharge>;

  // Cancela cobrança pendente no provider
  cancelCharge(providerChargeId: string): Promise<void>;

  // Busca estado atual da cobrança no provider (para sync manual)
  fetchCharge(providerChargeId: string): Promise<MemberCharge>;

  // Valida e normaliza webhook incoming do Asaas
  // ATENÇÃO: valida header 'asaas-access-token' (INCOMING do Asaas)
  //          diferente de 'access_token' que AsaasClient usa em chamadas SAINDO para a API
  parseWebhookEvent(
    rawBody: string,
    headers: Record<string, string>,
    webhookToken: string,  // de configuracao_recebimento.webhook_token
  ): CollectionWebhookEvent;
}
