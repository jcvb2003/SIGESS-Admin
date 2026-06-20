import { AsaasClient, AsaasApiError } from '../billing/asaas-client.ts';
import type { ICollectionProvider, EnsureMemberCustomerInput, CreateMemberChargeInput } from './provider.interface.ts';
import type { MemberCharge, CollectionWebhookEvent, CollectionWebhookEventType } from './types.ts';

// ─── Asaas API response shapes ────────────────────────────────────────────────

interface AsaasListResponse<T> {
  data: T[];
  totalCount: number;
}

interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
}

interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeUrl?: string;
  pixKey?: string;
}

interface AsaasWebhookBody {
  event: string;
  payment?: {
    id?: string;
    status?: string;
    paymentDate?: string;
    externalReference?: string;
  };
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapAsaasStatus(asaasStatus: string): MemberCharge['status'] {
  switch (asaasStatus) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'paga';
    case 'OVERDUE':
      return 'expirada';
    case 'REFUNDED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
    case 'DUNNING_RECEIVED':
      return 'cancelada';
    default:
      return 'pendente';
  }
}

function mapAsaasWebhookEvent(asaasEvent: string): CollectionWebhookEventType {
  switch (asaasEvent) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED_IN_CASH':
      return 'PAYMENT_RECEIVED';
    case 'PAYMENT_OVERDUE':
      return 'PAYMENT_OVERDUE';
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
    case 'PAYMENT_CHARGEBACK_DISPUTE':
      return 'PAYMENT_REFUNDED';
    default:
      return 'OTHER';
  }
}

function mapPayment(res: AsaasPayment): MemberCharge {
  return {
    providerChargeId: res.id,
    status: mapAsaasStatus(res.status),
    amount: res.value,
    dueDate: res.dueDate,
    paymentUrl: res.invoiceUrl ?? res.bankSlipUrl ?? undefined,
    pixCode: res.pixKey ?? undefined,
    pixQrCodeUrl: res.pixQrCodeUrl ?? undefined,
    paidAt: res.paymentDate ? `${res.paymentDate}T00:00:00Z` : undefined,
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class AsaasCollectionAdapter implements ICollectionProvider {
  readonly name = 'asaas';

  private readonly client: AsaasClient;

  constructor(apiKey: string, sandbox: boolean) {
    this.client = new AsaasClient(apiKey, sandbox);
  }

  async ensureCustomer(input: EnsureMemberCustomerInput): Promise<{ providerId: string }> {
    // Chave estável por sócio no tenant — nunca usa financeiro_cobrancas_externas.id
    const externalReference = `${input.tenantId}:${input.cpf}`;

    // 1. Lookup por externalReference
    const list = await this.client.get<AsaasListResponse<AsaasCustomer>>(
      '/customers',
      { externalReference, limit: '1' },
    );

    if (list.data.length > 0) {
      const existing = list.data[0];
      // 2. Update: propaga mudanças de nome/email/telefone do sócio
      // AsaasClient.post() cobre update via POST /customers/{id} (padrão Asaas)
      await this.client.post<AsaasCustomer>(`/customers/${existing.id}`, {
        name: input.nome,
        cpfCnpj: input.cpf,
        ...(input.email ? { email: input.email } : {}),
        ...(input.telefone ? { mobilePhone: input.telefone } : {}),
      });
      return { providerId: existing.id };
    }

    // 3. Create: primeira cobrança deste sócio no tenant
    const created = await this.client.post<AsaasCustomer>('/customers', {
      name: input.nome,
      cpfCnpj: input.cpf,
      externalReference,
      ...(input.email ? { email: input.email } : {}),
      ...(input.telefone ? { mobilePhone: input.telefone } : {}),
    });
    return { providerId: created.id };
  }

  async createCharge(input: CreateMemberChargeInput): Promise<MemberCharge> {
    const res = await this.client.post<AsaasPayment>('/payments', {
      customer: input.providerCustomerId,
      billingType: input.billingType,
      value: input.amount,
      dueDate: input.dueDate,
      description: input.description,
      // financeiro_cobrancas_externas.id — permite ao webhook achar o registro local
      externalReference: input.externalReference,
    });
    return mapPayment(res);
  }

  async cancelCharge(providerChargeId: string): Promise<void> {
    await this.client.delete(`/payments/${providerChargeId}`);
  }

  async fetchCharge(providerChargeId: string): Promise<MemberCharge> {
    const res = await this.client.get<AsaasPayment>(`/payments/${providerChargeId}`);
    return mapPayment(res);
  }

  parseWebhookEvent(
    rawBody: string,
    headers: Record<string, string>,
    webhookToken: string,
  ): CollectionWebhookEvent {
    // Valida 'asaas-access-token' — header que Asaas envia nos webhooks INCOMING
    // NÃO confundir com 'access_token' do AsaasClient (header para chamadas SAINDO)
    const incomingToken = headers['asaas-access-token'];
    if (!incomingToken || incomingToken !== webhookToken) {
      throw new Error('Invalid webhook token');
    }

    const body = JSON.parse(rawBody) as AsaasWebhookBody;
    const providerChargeId = body.payment?.id ?? '';
    const type = mapAsaasWebhookEvent(body.event ?? '');
    const paidAt = body.payment?.paymentDate
      ? `${body.payment.paymentDate}T00:00:00Z`
      : undefined;

    return {
      type,
      providerChargeId,
      externalReference: body.payment?.externalReference ?? undefined,
      paidAt,
      rawPayload: body,
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createCollectionProvider(apiKey: string, sandbox: boolean): ICollectionProvider {
  return new AsaasCollectionAdapter(apiKey, sandbox);
}

export { AsaasApiError };
