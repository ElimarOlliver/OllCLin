/**
 * OllCLin - Camada Controller
 * Controlador de Vendas (Financeiro — Cap. 15.1.2)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  saleModel,
  type CreateSaleInput,
  type Sale,
  type SaleStatus,
} from "../models/sale.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

const saleStatusSchema = z.enum(["a_receber", "recebido", "cancelada"]);

const saleItemSchema = z.object({
  procedureId: z.number().int().positive().optional(),
  professionalId: z.number().int().positive().optional(),
  description: z.string().max(255).optional(),
  quantity: z.number().positive().default(1),
  unitAmount: z.number().min(0),
});

export const createSaleSchema = z.object({
  organizationId: z.number().int().positive(),
  patientId: z.number().int().positive().optional(),
  payerName: z.string().max(255).optional(),
  healthPlanId: z.number().int().positive().optional(),
  paymentMethodId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  professionalId: z.number().int().positive().optional(),
  installmentNo: z.number().int().min(1).max(48).default(1),
  installmentsTotal: z.number().int().min(1).max(48).default(1),
  amount: z.number().min(0),
  status: saleStatusSchema.default("a_receber"),
  issuedAt: z.string().optional(),
  receivedAt: z.string().optional(),
  description: z.string().optional(),
  attachmentUrl: z.string().url().optional().or(z.literal("")),
  items: z.array(saleItemSchema).max(50).optional(),
});

export const updateSaleSchema = createSaleSchema
  .omit({ organizationId: true })
  .partial()
  .extend({ id: z.number().int().positive(), organizationId: z.number().int().positive() });

export const saleFilterSchema = z.object({
  organizationId: z.number().int().positive(),
  status: saleStatusSchema.optional(),
  professionalId: z.number().int().positive().optional(),
  healthPlanId: z.number().int().positive().optional(),
  paymentMethodId: z.number().int().positive().optional(),
  locationId: z.number().int().positive().optional(),
  procedureId: z.number().int().positive().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

function totalOf(
  items: Array<{ quantity: number; unitAmount: number }> | undefined,
  fallback: number,
): number {
  if (!items || items.length === 0) return fallback;
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);
  return Number(total.toFixed(2));
}

export const saleRouter = router({
  list: protectedProcedure.input(saleFilterSchema).query(({ input }) => saleModel.findMany(input)),

  summary: protectedProcedure
    .input(saleFilterSchema.omit({ limit: true, offset: true, status: true }))
    .query(({ input }) => saleModel.summarize(input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const sale = await saleModel.findById(input.id, input.organizationId);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
      return sale;
    }),

  history: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const sale = await saleModel.findById(input.id, input.organizationId);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
      return saleModel.listHistory(input.id);
    }),

  create: protectedProcedure
    .input(createSaleSchema)
    .mutation(async ({ ctx, input }): Promise<Sale> => {
      const amount = totalOf(input.items, input.amount);
      const createInput: CreateSaleInput = {
        ...input,
        amount,
        attachmentUrl: input.attachmentUrl || undefined,
        createdBy: ctx.user.id,
        status: input.status as SaleStatus,
      };
      const sale = await saleModel.create(createInput);

      await saleModel.addHistory(sale.id, ctx.user.id, "CREATE", {
        amount: sale.amount,
        status: sale.status,
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "sale",
        entityId: sale.id,
        newValues: { amount: sale.amount, status: sale.status },
        request: ctx.req,
      });
      return sale;
    }),

  update: protectedProcedure
    .input(updateSaleSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const existing = await saleModel.findById(id, organizationId);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
      if (existing.status === "cancelada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Venda cancelada não pode ser editada" });
      }

      const sale = await saleModel.update(id, organizationId, {
        id,
        ...data,
        amount: data.items ? totalOf(data.items, data.amount ?? existing.amount) : data.amount,
        attachmentUrl: data.attachmentUrl || undefined,
      });
      await saleModel.addHistory(id, ctx.user.id, "UPDATE", data as Record<string, unknown>);
      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "sale",
        entityId: id,
        oldValues: { amount: existing.amount, status: existing.status },
        newValues: data,
        request: ctx.req,
      });
      return sale;
    }),

  cancel: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
        reason: z.string().min(3, "Motivo do cancelamento é obrigatório"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const sale = await saleModel.cancel(input.id, input.organizationId, ctx.user.id, input.reason);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CANCEL",
        entity: "sale",
        entityId: input.id,
        newValues: { status: "cancelada", reason: input.reason },
        request: ctx.req,
      });
      return sale;
    }),
});
