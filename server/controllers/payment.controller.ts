/**
 * OllCLin - Fase 5 (SaaS): Controlador de pagamentos (maquininhas de cartão).
 *
 * Procedures tRPC para o fluxo completo de pagamento presencial/presencial remoto:
 *   create → capture → cancel/refund, com transições auditadas e idempotência.
 *
 * Valores SEMPRE em centavos. Nenhum dado de cartão transita pelo OllCLin —
 * apenas tokens gerados pela adquirente.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, protectedWith, router } from "../_core/trpc";
import { activePaymentProvider } from "../lib/payment-mock";
import type { CreatePaymentInput, PaymentMethodKind } from "../lib/payment-provider";
import { paymentModel } from "../models/payment.model";
import { writeAuditLog } from "../lib/audit";

const PAYMENT_METHODS: PaymentMethodKind[] = ["card_credit", "card_debit", "pix", "cash", "voucher"];

const methodSchema = z.enum(["card_credit", "card_debit", "pix", "cash", "voucher"]);
const statusSchema = z.enum([
  "created", "pending", "authorized", "captured",
  "failed", "cancelled", "refunded", "partially_refunded",
]);

function asTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof TRPCError) return error;
  return new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallback,
  });
}

export const paymentRouter = router({
  /** Cria intenção de pagamento (idempotente por chave derivada da referência). */
  create: protectedWith("finance.write")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        referenceType: z.enum(["sale", "revenue", "appointment"]),
        referenceId: z.number().int().positive(),
        amountCents: z.number().int().positive().max(100_000_000),
        method: methodSchema,
        installments: z.number().int().min(1).max(24).default(1),
        capture: z.boolean().default(true),
        cardToken: z.string().max(512).optional(),
        referenceVersion: z.string().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const idempotencyKey = `payment:${input.referenceType}:${input.referenceId}:v${input.referenceVersion ?? Date.now()}`;
        const existing = await paymentModel.findByIdempotencyKey(idempotencyKey);
        if (existing) {
          if (existing.organizationId !== input.organizationId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Acesso negado para este tenant" });
          }
          return existing;
        }

        const providerInput: CreatePaymentInput = {
          organizationId: input.organizationId,
          idempotencyKey,
          amountCents: input.amountCents,
          currency: "BRL",
          method: input.method,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          description: `OllCLin ${input.referenceType} #${input.referenceId}`,
          cardToken: input.cardToken,
          installments: input.installments,
          capture: input.capture,
        };

        const result = await activePaymentProvider.createPayment(providerInput);
        const intent = await paymentModel.createIntent({
          id: result.paymentIntentId,
          organizationId: input.organizationId,
          idempotencyKey,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          amountCents: input.amountCents,
          method: input.method,
          installments: input.installments,
          status: result.status,
          providerName: result.providerName,
          providerTransactionId: result.providerTransactionId,
          description: providerInput.description,
        });

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "CREATE",
          entity: "payment_intent",
          newValues: {
            id: intent.id,
            amountCents: intent.amountCents,
            method: intent.method,
            status: intent.status,
            provider: result.providerName,
          },
          request: ctx.req,
        });

        return intent;
      } catch (error) {
        throw asTrpcError(error, "Falha ao criar pagamento");
      }
    }),

  /** Consulta o status atual de um pagamento. */
  get: protectedWith("finance.read")
    .input(z.object({ organizationId: z.number().int().positive(), paymentIntentId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
      if (!intent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });
      }
      return intent;
    }),

  /** Lista pagamentos da organização. */
  list: protectedWith("finance.read")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => paymentModel.listByOrganization(input.organizationId, input.limit)),

  /** Cancela um pagamento ainda não capturado. */
  cancel: protectedWith("finance.write")
    .input(z.object({ organizationId: z.number().int().positive(), paymentIntentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
        if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });

        const providerResult = await activePaymentProvider.cancelPayment(intent.providerTransactionId ?? intent.id);
        const updated = await paymentModel.updateStatus({
          id: intent.id,
          organizationId: input.organizationId,
          fromStatus: intent.status,
          toStatus: providerResult.status,
        });
        if (!updated) throw new Error("Falha ao atualizar status do pagamento");

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "CANCEL",
          entity: "payment_intent",
          entityId: null,
          newValues: { id: intent.id, from: intent.status, to: providerResult.status },
          request: ctx.req,
        });
        return updated;
      } catch (error) {
        throw asTrpcError(error, "Falha ao cancelar pagamento");
      }
    }),

  /** Estorna total ou parcialmente um pagamento capturado. */
  refund: protectedWith("finance.write")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        paymentIntentId: z.string().min(1),
        amountCents: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
        if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });

        const providerResult = await activePaymentProvider.refundPayment(
          intent.providerTransactionId ?? intent.id,
          input.amountCents,
        );
        const updated = await paymentModel.updateStatus({
          id: intent.id,
          organizationId: input.organizationId,
          fromStatus: intent.status,
          toStatus: providerResult.status,
          amountCents: input.amountCents ?? intent.amountCents,
        });
        if (!updated) throw new Error("Falha ao atualizar status do pagamento");

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "payment_intent",
          entityId: null,
          newValues: {
            id: intent.id,
            refundCents: input.amountCents ?? intent.amountCents,
            from: intent.status,
            to: providerResult.status,
          },
          request: ctx.req,
        });
        return updated;
      } catch (error) {
        throw asTrpcError(error, "Falha ao estornar pagamento");
      }
    }),

  /** Histórico de transições de estado de um pagamento. */
  transactions: protectedWith("finance.read")
    .input(z.object({ organizationId: z.number().int().positive(), paymentIntentId: z.string().min(1) }))
    .query(async ({ input }) => {
      const intent = await paymentModel.findById(input.paymentIntentId, input.organizationId);
      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado" });
      return paymentModel.listTransactions(intent.id, input.organizationId);
    }),

  /** Catálogo de métodos de pagamento suportados (para o frontend). */
  methods: protectedProcedure.query(() => PAYMENT_METHODS.map((m) => ({ id: m }))),
  statusList: protectedProcedure.query(() => statusSchema.options),
});
