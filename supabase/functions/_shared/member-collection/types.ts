export interface MemberCharge {
  providerChargeId: string;
  status: 'pendente' | 'paga' | 'cancelada' | 'expirada';
  amount: number;
  dueDate: string;        // YYYY-MM-DD
  paymentUrl?: string;    // boleto URL ou invoice URL
  pixCode?: string;       // PIX copia-e-cola
  pixQrCodeUrl?: string;
  paidAt?: string;        // ISO timestamp quando confirmado pago
}

export type CollectionWebhookEventType =
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_REFUNDED'
  | 'OTHER';

export interface CollectionWebhookEvent {
  type: CollectionWebhookEventType;
  providerChargeId: string;
  // financeiro_cobrancas_externas.id — chave usada na criação da cobrança
  // permite localizar o registro local sem depender de IDs internos do provider
  externalReference?: string;
  paidAt?: string;
  rawPayload: unknown;
}
