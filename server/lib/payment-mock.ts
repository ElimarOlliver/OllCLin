/**
 * OllCLin - Fase 5 (SaaS): Provider de pagamento MOCK.
 *
 * Implementação de referência do contrato `PaymentProvider` para desenvolvimento
 * e homologação. Simula autorização/captura/estorno sem chamar adquirente real.
 *
 * Em produção, criar `StonePaymentProvider`, `CieloPaymentProvider` etc. seguindo
 * exatamente este contrato — nada no domínio precisa mudar.
 */

import type {
  CreatePaymentInput,
  PaymentResult,
  PaymentResultStatus,
} from "./payment-provider";

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  getPayment(id: string): Promise<PaymentResult | null>;
  cancelPayment(id: string): Promise<PaymentResult>;
  refundPayment(id: string, amountCents?: number): Promise<PaymentResult>;
  /** Valida assinatura HMAC do webhook (header x-signature). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

const STATUS_FLOW: PaymentResultStatus[] = [
  "created",
  "pending",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
];

  /** Persistência mínima em memória (apenas para o mock). Indexada por idempotency_key E paymentIntentId. */
const store = new Map<string, PaymentResult>();

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  private assertAmount(amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error("Valor deve ser um inteiro positivo em centavos");
    }
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    this.assertAmount(input.amountCents);
    const existing = store.get(input.idempotencyKey);
    if (existing) return existing; // idempotência

    const capture = input.capture ?? true;
    const status: PaymentResultStatus = capture ? "captured" : "authorized";
    const result: PaymentResult = {
      status,
      providerTransactionId: `mock_${crypto.randomUUID()}`,
      paymentIntentId: `pi_${crypto.randomUUID()}`,
      providerName: this.name,
      amountCents: input.amountCents,
      extra: {
        nsu: Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0"),
        authorizationCode: crypto.randomUUID().slice(0, 6).toUpperCase(),
        installments: input.installments ?? 1,
        method: input.method,
        reference: `${input.referenceType}:${input.referenceId}`,
      },
    };
    store.set(input.idempotencyKey, result);
    store.set(result.paymentIntentId, result);
    return result;
  }

  async getPayment(id: string): Promise<PaymentResult | null> {
    return store.get(id) ?? null;
  }

  async cancelPayment(id: string): Promise<PaymentResult> {
    const payment = store.get(id);
    if (!payment) throw new Error("Pagamento não encontrado");
    if (!STATUS_FLOW.includes(payment.status)) throw new Error("Status inválido");
    if (payment.status === "refunded" || payment.status === "cancelled") return payment;
    const updated: PaymentResult = { ...payment, status: "cancelled" };
    store.set(id, updated);
    store.set(payment.paymentIntentId, updated);
    return updated;
  }

  async refundPayment(id: string, amountCents?: number): Promise<PaymentResult> {
    const payment = store.get(id);
    if (!payment) throw new Error("Pagamento não encontrado");
    if (payment.status !== "captured" && payment.status !== "partially_refunded") {
      throw new Error("Somente pagamentos capturados podem ser estornados");
    }
    if (amountCents !== undefined) this.assertAmount(amountCents);
    const partial = amountCents !== undefined && amountCents < payment.amountCents;
    const updated: PaymentResult = {
      ...payment,
      status: partial ? "partially_refunded" : "refunded",
    };
    store.set(id, updated);
    store.set(payment.paymentIntentId, updated);
    return updated;
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    // Mock: aceita assinatura "mock-ok" (nunca use em produção real).
    return signature === "mock-ok" && rawBody.length >= 0;
  }
}

/** Provider ativo (mock até integração real — Fase 5 SaaS). */
export const activePaymentProvider: PaymentProvider = new MockPaymentProvider();
