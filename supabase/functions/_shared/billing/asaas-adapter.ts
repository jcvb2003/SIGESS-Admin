import type { BillingProvider } from './provider.interface.ts';
import type {
  BillingWebhookEvent,
  ProviderCharge,
  ProviderCustomer,
  ProviderSubscription,
} from './types.ts';
import type {
  CancelChargeInput,
  CancelSubscriptionInput,
  CreateChargeInput,
  CreateSubscriptionInput,
  EnsureCustomerInput,
  FetchChargeInput,
  FetchSubscriptionInput,
  ParseWebhookInput,
} from './provider.interface.ts';
import { AsaasApiError, AsaasClient } from './asaas-client.ts';
import {
  mapAsaasChargeStatus,
  mapAsaasSubscriptionStatus,
  mapAsaasWebhookEventType,
} from './status-mappers.ts';

// ─── Asaas API response shapes ────────────────────────────────────────────────

interface AsaasListResponse<T> {
  data: T[];
}

interface AsaasCustomer {
  id: string;
}

interface AsaasSubscription {
  id: string;
  status: string;
  nextDueDate?: string;
}

interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
}

interface AsaasWebhookBody {
  id: string;
  event: string;
  payment?: {
    id?: string;
    status?: string;
    paymentDate?: string;
    subscription?: string | { id: string };
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePaymentDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  return `${iso}T00:00:00Z`;
}

function mapPayment(res: AsaasPayment): ProviderCharge {
  return {
    providerChargeId: res.id,
    status: mapAsaasChargeStatus(res.status),
    amount: res.value,
    dueDate: res.dueDate,
    paymentUrl: res.invoiceUrl ?? res.bankSlipUrl ?? undefined,
    paidAt: normalizePaymentDate(res.paymentDate),
  };
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class AsaasAdapter implements BillingProvider {
  readonly name = 'asaas';

  constructor(
    private readonly client: AsaasClient,
    private readonly webhookToken?: string,
  ) {}

  async ensureCustomer(input: EnsureCustomerInput): Promise<ProviderCustomer> {
    // Customer identity is tenant-scoped: externalReference is the canonical lookup key.
    // cpfCnpj is a required customer attribute but must NOT be used to reuse a customer
    // from another tenant — matching cpfCnpj alone does not authorize cross-tenant fusion.
    if (input.externalRef) {
      const found = await this.client.get<AsaasListResponse<AsaasCustomer>>(
        '/customers',
        { externalReference: input.externalRef, limit: '1' },
      );
      if (found.data[0]) return { providerCustomerId: found.data[0].id };
    }

    const res = await this.client.post<AsaasCustomer>('/customers', {
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email,
      ...(input.phone ? { mobilePhone: input.phone } : {}),
      ...(input.externalRef ? { externalReference: input.externalRef } : {}),
    });
    return { providerCustomerId: res.id };
  }

  async createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription> {
    const res = await this.client.post<AsaasSubscription>('/subscriptions', {
      customer: input.providerCustomerId,
      billingType: 'BOLETO',
      value: input.amount,
      nextDueDate: input.nextDueDate,
      cycle: input.interval === 'annual' ? 'YEARLY' : 'MONTHLY',
      ...(input.description ? { description: input.description } : {}),
    });
    return {
      providerSubscriptionId: res.id,
      billingStatus: mapAsaasSubscriptionStatus(res.status),
      nextBillingDate: res.nextDueDate,
    };
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    try {
      await this.client.delete(`/subscriptions/${input.providerSubscriptionId}`);
    } catch (e) {
      if (e instanceof AsaasApiError && e.status === 404) return;
      throw e;
    }
  }

  async createCharge(input: CreateChargeInput): Promise<ProviderCharge> {
    const res = await this.client.post<AsaasPayment>('/payments', {
      customer: input.providerCustomerId,
      billingType: input.billingType ?? 'BOLETO',
      value: input.amount,
      dueDate: input.dueDate,
      description: input.description,
    });
    return mapPayment(res);
  }

  async cancelCharge(input: CancelChargeInput): Promise<void> {
    try {
      await this.client.delete(`/payments/${input.providerChargeId}`);
    } catch (e) {
      if (e instanceof AsaasApiError && e.status === 404) return;
      throw e;
    }
  }

  async fetchSubscription(input: FetchSubscriptionInput): Promise<ProviderSubscription> {
    const res = await this.client.get<AsaasSubscription>(
      `/subscriptions/${input.providerSubscriptionId}`,
    );
    return {
      providerSubscriptionId: res.id,
      billingStatus: mapAsaasSubscriptionStatus(res.status),
      nextBillingDate: res.nextDueDate,
    };
  }

  async fetchCharge(input: FetchChargeInput): Promise<ProviderCharge> {
    const res = await this.client.get<AsaasPayment>(`/payments/${input.providerChargeId}`);
    return mapPayment(res);
  }

  parseWebhookEvent(input: ParseWebhookInput): BillingWebhookEvent {
    if (this.webhookToken) {
      const token = input.headers['asaas-access-token'];
      if (token !== this.webhookToken) {
        throw new Error('Invalid webhook token');
      }
    }

    const body = JSON.parse(input.rawBody) as AsaasWebhookBody;

    const sub = body.payment?.subscription;
    const providerSubscriptionId: string | undefined =
      typeof sub === 'object' && sub !== null
        ? sub.id
        : typeof sub === 'string'
        ? sub
        : undefined;

    return {
      providerEventId: body.id,
      eventType: mapAsaasWebhookEventType(body.event),
      rawEventType: body.event,
      providerChargeId: body.payment?.id,
      providerSubscriptionId,
      chargeStatus: body.payment?.status
        ? mapAsaasChargeStatus(body.payment.status)
        : undefined,
      paidAt: normalizePaymentDate(body.payment?.paymentDate),
    };
  }
}
