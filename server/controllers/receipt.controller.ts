/**
 * OllCLin - Camada Controller
 * Controlador de Recibos (Financeiro — Cap. 15.5)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { receiptModel, type ReceiptIssuerType } from "../models/receipt.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";
import { getSupabaseAdmin } from "../lib/supabase-server";

const issuerTypeSchema = z.enum(["usuario", "estabelecimento"]);

function asTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof TRPCError) return error;
  return new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : fallback,
  });
}

const createReceiptSchema = z.object({
  organizationId: z.number().int().positive(),
  revenueId: z.number().int().positive().optional(),
  saleId: z.number().int().positive().optional(),
  issuerType: issuerTypeSchema,
  issuerUserId: z.number().int().positive().optional(),
  issuerEstablishmentId: z.number().int().positive().optional(),
  payerName: z.string().min(2, "Nome do pagador é obrigatório").max(255),
  amount: z.number().positive("Valor deve ser maior que zero"),
  description: z.string().max(500).optional(),
  issuedAt: z.string().optional(),
});

export const receiptRouter = router({
  /** Emitentes disponíveis: usuários da clínica e estabelecimentos (Cap. 15.5). */
  issuerOptions: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const [users, establishments] = await Promise.all([
        getSupabaseAdmin()
          .from("users")
          .select("id, name")
          .eq("organization_id", input.organizationId)
          .order("name"),
        getSupabaseAdmin()
          .from("establishments")
          .select("id, name")
          .eq("organization_id", input.organizationId)
          .order("name"),
      ]);

      if (users.error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: users.error.message });
      }
      if (establishments.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: establishments.error.message,
        });
      }

      return {
        users: (users.data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as number,
          name: row.name as string,
        })),
        establishments: (establishments.data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as number,
          name: row.name as string,
        })),
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        status: z.enum(["emitido", "cancelado"]).optional(),
        search: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await receiptModel.findMany(input);
      } catch (error) {
        throw asTrpcError(error, "Falha ao listar recibos");
      }
    }),

  getById: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      const receipt = await receiptModel.findById(input.id, input.organizationId);
      if (!receipt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recibo não encontrado" });
      }
      return receipt;
    }),

  history: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      const receipt = await receiptModel.findById(input.id, input.organizationId);
      if (!receipt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recibo não encontrado" });
      }
      return receiptModel.listHistory(input.id);
    }),

  create: protectedProcedure
    .input(createReceiptSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.issuerType === "estabelecimento" && !input.issuerEstablishmentId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione o estabelecimento emitente",
        });
      }
      if (input.issuerType === "usuario" && !input.issuerUserId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione o usuário emitente",
        });
      }

      try {
        const receipt = await receiptModel.create({
          ...input,
          issuerType: input.issuerType as ReceiptIssuerType,
          createdBy: ctx.user.id,
        });

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "CREATE",
          entity: "receipt",
          entityId: receipt.id,
          newValues: { payerName: receipt.payerName, amount: receipt.amount },
          request: ctx.req,
        });

        return receipt;
      } catch (error) {
        throw asTrpcError(error, "Falha ao emitir recibo");
      }
    }),

  update: protectedProcedure
    .input(
      createReceiptSchema
        .omit({ organizationId: true })
        .partial()
        .extend({
          id: z.number().int().positive(),
          organizationId: z.number().int().positive(),
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const existing = await receiptModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recibo não encontrado" });
      }
      if (existing.status === "cancelado") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Recibo cancelado não pode ser editado",
        });
      }

      try {
        const receipt = await receiptModel.update(id, organizationId, data);
        await writeAuditLog({
          organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "receipt",
          entityId: id,
          oldValues: { payerName: existing.payerName, amount: existing.amount },
          newValues: data,
          request: ctx.req,
        });
        return receipt;
      } catch (error) {
        throw asTrpcError(error, "Falha ao atualizar recibo");
      }
    }),

  /** Cancelamento com motivo obrigatório no histórico (Cap. 15.5). */
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
        const receipt = await receiptModel.cancel(
          input.id,
          input.organizationId,
          ctx.user.id,
          input.reason,
        );
        if (!receipt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Recibo não encontrado" });
        }

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "CANCEL",
          entity: "receipt",
          entityId: input.id,
          newValues: { status: "cancelado", reason: input.reason },
          request: ctx.req,
        });

        return receipt;
      } catch (error) {
        throw asTrpcError(error, "Falha ao cancelar recibo");
      }
    }),
});
