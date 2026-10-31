/**
 * OllCLin - Camada Controller
 * Controlador de Repasses (Financeiro — Cap. 15.3)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { payoutModel } from "../models/payout.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

const payoutStatusSchema = z.enum(["nao_repassado", "repassado", "todos"]);

function asTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof TRPCError) return error;
  return new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallback,
  });
}

const periodSchema = z.object({
  organizationId: z.number().int().positive(),
  professionalId: z.number().int().positive(),
  locationId: z.number().int().positive().optional(),
  from: z.string().min(10, "Informe a data inicial"),
  to: z.string().min(10, "Informe a data final"),
});

export const payoutRouter = router({
  /** Recebimentos elegíveis, com marcação de já repassados (Cap. 15.3.1). */
  eligibleRevenues: protectedProcedure
    .input(periodSchema.extend({ status: payoutStatusSchema.default("todos") }))
    .query(async ({ input }) => {
      try {
        return await payoutModel.listEligibleRevenues(input);
      } catch (error) {
        throw asTrpcError(error, "Falha ao listar receitas elegíveis");
      }
    }),

  /** Percentual de repasse configurado no profissional. */
  professionalPercentage: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        professionalId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return {
          percentage: await payoutModel.getProfessionalPercentage(
            input.organizationId,
            input.professionalId,
          ),
        };
      } catch (error) {
        throw asTrpcError(error, "Falha ao consultar percentual");
      }
    }),

  /** Retroativo pendente do profissional/local (Cap. 15.3.1). */
  carryover: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        professionalId: z.number().int().positive(),
        locationId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return {
          amount: await payoutModel.pendingCarryover(
            input.organizationId,
            input.professionalId,
            input.locationId,
          ),
        };
      } catch (error) {
        throw asTrpcError(error, "Falha ao calcular retroativo");
      }
    }),

  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        professionalId: z.number().int().positive().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await payoutModel.list(input);
      } catch (error) {
        throw asTrpcError(error, "Falha ao listar repasses");
      }
    }),

  history: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await payoutModel.listHistory(input.id);
      } catch (error) {
        throw asTrpcError(error, "Falha ao listar histórico do repasse");
      }
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        professionalId: z.number().int().positive(),
        locationId: z.number().int().positive().optional(),
        periodStart: z.string().min(10, "Informe o início do período"),
        periodEnd: z.string().min(10, "Informe o fim do período"),
        percentage: z.number().min(0).max(100),
        amount: z.number().min(0).optional(),
        revenueIds: z
          .array(z.number().int().positive())
          .min(1, "Selecione ao menos uma receita"),
        notes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const payout = await payoutModel.create({
          ...input,
          createdBy: ctx.user.id,
        });

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "CREATE",
          entity: "payout",
          entityId: payout.id,
          newValues: {
            professionalId: payout.professionalId,
            percentage: payout.percentage,
            expectedAmount: payout.expectedAmount,
            carryoverAmount: payout.carryoverAmount,
            amount: payout.amount,
          },
          request: ctx.req,
        });

        return payout;
      } catch (error) {
        throw asTrpcError(error, "Falha ao registrar repasse");
      }
    }),

  /** Cancelamento com motivo; receitas voltam a ficar elegíveis (Cap. 15.3.2). */
  cancel: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
        reason: z.string().min(3, "Motivo do cancelamento é obrigatório"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const payout = await payoutModel.cancel(
          input.id,
          input.organizationId,
          ctx.user.id,
          input.reason,
        );
        if (!payout) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Repasse não encontrado" });
        }

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "CANCEL",
          entity: "payout",
          entityId: input.id,
          newValues: { status: "cancelado", reason: input.reason },
          request: ctx.req,
        });

        return payout;
      } catch (error) {
        throw asTrpcError(error, "Falha ao cancelar repasse");
      }
    }),
});
