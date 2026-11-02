/**
 * OllCLin - Fase 5 (SaaS): Camada de abstração de pagamentos.
 *
 * Contrato único para adquirentes/maquininhas de cartão (Stone, Cielo,
 * PagSeguro, Mercado Pago, SumUp, etc.). O domínio clínico NUNCA fala
 * diretamente com uma adquirente — apenas com esta interface.
 *
 * Regras de segurança (LGPD + PCI):
 * - nunca armazenar PAN (número completo do cartão) — somente tokenização;
 * - valores sempre em CENTAVOS (inteiros), nunca float;
 * - idempotência obrigatória em toda operação mutante;
 * - webhooks sempre validados por assinatura HMAC.
 */

export type PaymentAmount = number; // centavos, inteiro >= 0

export type PaymentMethodKind = "card_credit" | "card_debit" | "pix" | "cash" | "voucher";

export type CreatePaymentInput = {
  organizationId: number;
  /** Chave de idempotência gerada pelo OllCLin (ex.: sale:{id}:v:{updatedAt}). */
  idempotencyKey: string;
  amountCents: PaymentAmount;
  currency: "BRL";
  method: PaymentMethodKind;
  /** Referência interna (sale, revenue, appointment...). */
  referenceType: string;
  referenceId: number;
  description: string;
  /** Dados do cartão JÁ tokenizados pela adquirente — nunca PAN. */
  cardToken?: string;
  installments?: number;
  /** Parcelamento no cartão sempre com a primeira parcela imediata (padrão clínica). */
  capture?: boolean;
};

export type PaymentResultStatus =
  | "created"
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type PaymentResult = {
  status: PaymentResultStatus;
  /** ID da transação na adquirente. */
  providerTransactionId: string;
  /** ID local gerado pelo OllCLin (payment_intents.id). */
  paymentIntentId: string;
  providerName: string;
  amountCents: PaymentAmount;
  /** Informação adicional (NSU, código de autorização, QR Code PIX...). */
  extra?: Record<string, unknown>;
};
