/**
 * OllCLin - Fase 5 (SaaS): Modelo financeiro de pagamentos.
 *
 * Tabelas (migração 0009_payments.sql):
 *   payment_intents         — intenção de pagamento (idempotente por chave)
 *   payment_transactions    — histórico de transições de estado
 *   payment_webhook_events  — eventos recebidos das adquirentes (dedupe)
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import type { PaymentResultStatus } from "../lib/payment-provider";

export type PaymentIntent = {
  id: string;
  organizationId: number;
  idempotencyKey: string;
  referenceType: string;
  referenceId: number;
  amountCents: number;
  currency: string;
  method: string;
  installments: number;
  status: PaymentResultStatus;
  providerName: string;
  providerTransactionId: string | null;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PaymentTransaction = {
  id: number;
  paymentIntentId: string;
  organizationId: number;
  fromStatus: string | null;
  toStatus: string;
  amountCents: number | null;
  payload: Record<string, unknown> | null;
  createdAt: string | null;
};

const INTENT_COLUMNS =
  "id, organization_id, idempotency_key, reference_type, reference_id, amount_cents, currency, method, installments, status, provider_name, provider_transaction_id, description, created_at, updated_at";

const TX_COLUMNS =
  "id, payment_intent_id, organization_id, from_status, to_status, amount_cents, payload, created_at";

function toIntent(row: Record<string, unknown>): PaymentIntent {
  return {
    id: String(row.id),
    organizationId: Number(row.organization_id),
    idempotencyKey: String(row.idempotency_key ?? ""),
    referenceType: String(row.reference_type ?? ""),
    referenceId: Number(row.reference_id ?? 0),
    amountCents: Number(row.amount_cents ?? 0),
    currency: String(row.currency ?? "BRL"),
    method: String(row.method ?? ""),
    installments: Number(row.installments ?? 1),
    status: (row.status as PaymentResultStatus) ?? "created",
    providerName: String(row.provider_name ?? ""),
    providerTransactionId: row.provider_transaction_id ? String(row.provider_transaction_id) : null,
    description: row.description ? String(row.description) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

function toTransaction(row: Record<string, unknown>): PaymentTransaction {
  return {
    id: Number(row.id),
    paymentIntentId: String(row.payment_intent_id),
    organizationId: Number(row.organization_id),
    fromStatus: row.from_status ? String(row.from_status) : null,
    toStatus: String(row.to_status ?? ""),
    amountCents: row.amount_cents === null || row.amount_cents === undefined ? null : Number(row.amount_cents),
    payload: (row.payload as Record<string, unknown>) ?? null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
  };
}

export const paymentModel = {
  /** Busca intenção por chave de idempotência (idempotência global). */
  async findByIdempotencyKey(idempotencyKey: string): Promise<PaymentIntent | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("payment_intents")
      .select(INTENT_COLUMNS)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return toIntent(data);
  },

  async findById(id: string, organizationId: number): Promise<PaymentIntent | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("payment_intents")
      .select(INTENT_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return toIntent(data);
  },

  async listByOrganization(organizationId: number, limit = 50): Promise<PaymentIntent[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("payment_intents")
      .select(INTENT_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));
    if (error) return [];
    return (data ?? []).map(toIntent);
  },

  async createIntent(input: {
    id: string;
    organizationId: number;
    idempotencyKey: string;
    referenceType: string;
    referenceId: number;
    amountCents: number;
    method: string;
    installments: number;
    status: PaymentResultStatus;
    providerName: string;
    providerTransactionId: string | null;
    description: string | null;
  }): Promise<PaymentIntent> {
    const { data, error } = await getSupabaseAdmin()
      .from("payment_intents")
      .insert({
        id: input.id,
        organization_id: input.organizationId,
        idempotency_key: input.idempotencyKey,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        amount_cents: input.amountCents,
        currency: "BRL",
        method: input.method,
        installments: input.installments,
        status: input.status,
        provider_name: input.providerName,
        provider_transaction_id: input.providerTransactionId,
        description: input.description,
      })
      .select(INTENT_COLUMNS)
      .single<Record<string, unknown>>();
    if (error || !data) throw new Error(`Falha ao criar intenção de pagamento: ${error?.message ?? "?"}`);
    return toIntent(data);
  },

  /** Atualiza status e registra a transição em payment_transactions. */
  async updateStatus(input: {
    id: string;
    organizationId: number;
    fromStatus: PaymentResultStatus | null;
    toStatus: PaymentResultStatus;
    amountCents?: number | null;
    providerTransactionId?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<PaymentIntent | null> {
    const patch: Record<string, unknown> = {
      status: input.toStatus,
      updated_at: new Date().toISOString(),
    };
    if (input.providerTransactionId) patch.provider_transaction_id = input.providerTransactionId;

    const { data, error } = await getSupabaseAdmin()
      .from("payment_intents")
      .update(patch)
      .eq("id", input.id)
      .eq("organization_id", input.organizationId)
      .select(INTENT_COLUMNS)
      .single<Record<string, unknown>>();
    if (error || !data) return null;

    await getSupabaseAdmin().from("payment_transactions").insert({
      payment_intent_id: input.id,
      organization_id: input.organizationId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      amount_cents: input.amountCents ?? null,
      payload: input.payload ?? {},
    });
    return toIntent(data);
  },

  async listTransactions(paymentIntentId: string, organizationId: number): Promise<PaymentTransaction[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("payment_transactions")
      .select(TX_COLUMNS)
      .eq("payment_intent_id", paymentIntentId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map(toTransaction);
  },

  /** Registra evento de webhook (idempotente por event_id da adquirente). */
  async recordWebhookEvent(input: {
    organizationId: number | null;
    providerName: string;
    eventId: string;
    payload: unknown;
  }): Promise<boolean> {
    const { error } = await getSupabaseAdmin()
      .from("payment_webhook_events")
      .insert({
        organization_id: input.organizationId,
        provider_name: input.providerName,
        event_id: input.eventId,
        payload: input.payload,
      });
    // Unique violation ⇒ evento já processado (dedupe).
    return !error;
  },
};
