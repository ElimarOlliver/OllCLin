/**
 * OllCLin - Camada Controller
 * Controlador de Receitas / Recebimentos (Financeiro — Cap. 15)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  revenueModel,
  type CreateRevenueInput,
  type Revenue,
  type RevenueStatus,
} from "../models/revenue.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";
import { getSupabaseAdmin } from "../lib/supabase-server";

const revenueStatusSchema = z.enum([
  "a_receber",
  "recebido",
  "cancelado",
  "desconto",
  "cortesia",
]);

export const createRevenueSchema = z.object({
  organizationId: z.number().int().positive(),
  patientId: z.number().int().positive().optional(),
  payerName: z.string().max(255).optional(),
  procedureId: z.number().int().positive().optional(),
  appointmentId: z.number().int().positive().optional(),
  healthPlanId: z.number().int().positive().optional(),
  paymentMethodId: z.number().int().positive().optional(),
  professionalId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  installmentNo: z.number().int().min(1).max(48).default(1),
  installmentsTotal: z.number().int().min(1).max(48).default(1),
  amount: z.number().min(0, "Valor não pode ser negativo"),
  status: revenueStatusSchema.default("a_receber"),
  dueDate: z.string().optional(),
  receivedAt: z.string().optional(),
  description: z.string().optional(),
});

export const updateRevenueSchema = z.object({
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  amount: z.number().min(0).optional(),
  status: revenueStatusSchema.optional(),
  payerName: z.string().max(255).optional(),
  dueDate: z.string().optional(),
  receivedAt: z.string().optional(),
  description: z.string().optional(),
  professionalId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
});

export const revenueFilterSchema = z.object({
  organizationId: z.number().int().positive(),
  patientId: z.number().int().positive().optional(),
  professionalId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  status: revenueStatusSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const revenueRouter = router({
  /** Formas de recebimento ativas para seleção (REQ-08-036). */
  paymentMethods: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { data, error } = await getSupabaseAdmin()
        .from("payment_methods")
        .select("id, name, type, allows_installments")
        .eq("organization_id", input.organizationId)
        .eq("is_active", true)
        .order("name");
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as number,
        name: row.name as string,
        type: row.type as string,
        allowsInstallments: row.allows_installments === true,
      }));
    }),

  list: protectedProcedure
    .input(revenueFilterSchema)
    .query(({ input }) => revenueModel.findMany(input)),

  /** Resumo de valores recebidos e a receber (Cap. 15.1). */
  summary: protectedProcedure
    .input(
      revenueFilterSchema.omit({ limit: true, offset: true, status: true }),
    )
    .query(({ input }) => revenueModel.summarize(input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const revenue = await revenueModel.findById(input.id, input.organizationId);
      if (!revenue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Receita não encontrada" });
      }
      return revenue;
    }),

  history: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const revenue = await revenueModel.findById(input.id, input.organizationId);
      if (!revenue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Receita não encontrada" });
      }
      return revenueModel.listHistory(input.id);
    }),

  create: protectedProcedure
    .input(createRevenueSchema)
    .mutation(async ({ ctx, input }): Promise<Revenue> => {
      if (input.installmentsTotal > 1 && input.installmentNo > input.installmentsTotal) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Número da parcela maior que o total de parcelas",
        });
      }

      const createInput: CreateRevenueInput = { ...input, createdBy: ctx.user.id };
      const revenue = await revenueModel.create(createInput);
      await revenueModel.addHistory(
        revenue.id,
        ctx.user.id,
        "CREATE",
        { amount: revenue.amount, status: revenue.status },
      );

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "revenue",
        entityId: revenue.id,
        newValues: { amount: revenue.amount, status: revenue.status },
        request: ctx.req,
      });

      return revenue;
    }),

  update: protectedProcedure
    .input(updateRevenueSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const existing = await revenueModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Receita não encontrada" });
      }
      if (existing.status === "cancelado") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Receita cancelada não pode ser editada",
        });
      }

      const revenue = await revenueModel.update(id, organizationId, { id, ...data });
      await revenueModel.addHistory(id, ctx.user.id, "UPDATE", data);

      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "revenue",
        entityId: id,
        oldValues: { status: existing.status, amount: existing.amount },
        newValues: data,
        request: ctx.req,
      });

      return revenue;
    }),

  /**
   * Cancelamento apenas para status A RECEBER, com motivo obrigatório
   * registrado no histórico (Cap. 15.1.1).
   */
  cancel: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
        reason: z.string().min(3, "Motivo do cancelamento é obrigatório"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const revenue = await revenueModel.cancel(
        input.id,
        input.organizationId,
        ctx.user.id,
        input.reason,
      );
      if (!revenue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Receita não encontrada" });
      }

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CANCEL",
        entity: "revenue",
        entityId: input.id,
        newValues: { status: "cancelado", reason: input.reason },
        request: ctx.req,
      });

      return revenue;
    }),
});
