/**
 * OllCLin - Fase 5 (SaaS): Testes do PaymentProvider mock.
 */

import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "./payment-mock";
import type { CreatePaymentInput } from "./payment-provider";

const provider = new MockPaymentProvider();

function baseInput(overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput {
  return {
    organizationId: 1,
    idempotencyKey: `payment:test:${Math.random().toString(36).slice(2)}`,
    amountCents: 15000,
    currency: "BRL",
    method: "card_credit",
    referenceType: "sale",
    referenceId: 1,
    description: "Teste",
    ...overrides,
  };
}

describe("MockPaymentProvider (Fase 5)", () => {
  it("cria pagamento capturado e respeita idempotência", async () => {
    const input = baseInput({ idempotencyKey: "payment:test:idem-1" });
    const first = await provider.createPayment(input);
    const second = await provider.createPayment(input);

    expect(first.status).toBe("captured");
    expect(second.paymentIntentId).toBe(first.paymentIntentId);
    expect(second.providerTransactionId).toBe(first.providerTransactionId);
  });

  it("autoriza sem captura quando capture=false", async () => {
    const result = await provider.createPayment(baseInput({ capture: false }));
    expect(result.status).toBe("authorized");
  });

  it("rejeita valor não inteiro ou não positivo", async () => {
    await expect(provider.createPayment(baseInput({ amountCents: 10.5 }))).rejects.toThrow(/centavos/i);
    await expect(provider.createPayment(baseInput({ amountCents: 0 }))).rejects.toThrow(/centavos/i);
  });

  it("cancela pagamento autorizado e estorna capturado", async () => {
    const authorized = await provider.createPayment(baseInput({ capture: false }));
    const cancelled = await provider.cancelPayment(authorized.paymentIntentId);
    expect(cancelled.status).toBe("cancelled");

    const captured = await provider.createPayment(baseInput());
    const refunded = await provider.refundPayment(captured.paymentIntentId);
    expect(refunded.status).toBe("refunded");
  });

  it("estorno parcial retorna partially_refunded", async () => {
    const captured = await provider.createPayment(baseInput());
    const partial = await provider.refundPayment(captured.paymentIntentId, 5000);
    expect(partial.status).toBe("partially_refunded");
  });

  it("valida assinatura de webhook", () => {
    expect(provider.verifyWebhookSignature("{}", "mock-ok")).toBe(true);
    expect(provider.verifyWebhookSignature("{}", "invalida")).toBe(false);
  });
});
