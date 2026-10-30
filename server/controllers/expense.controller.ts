/**
 * OllCLin - Camada Controller
 * Controlador de Despesas + Categorias (Financeiro Cap. 15.2 / Cap. 08.2)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  expenseModel,
  type CreateExpenseInput,
} from "../models/expense.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

const expenseStatusSchema = z.enum(["a_pagar", "pago", "cancelado"]);

export const expenseRouter = router({
  /** Categorias hierárquicas (tipo -> categoria) para o formulário (REQ-08-025). */
  categories: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(({ input }) => expenseModel.listCategories(input.organizationId)),

  createCategory: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        name: z.string().min(2, "Nome da categoria é obrigatório"),
        kind: z.enum(["fixa", "variavel"]),
        parentId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cat = await expenseModel.createCategory(
        input.organizationId,
        input.name,
        input.kind,
        input.parentId,
      );
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "expense_category",
        entityId: cat.id,
        newValues: { name: cat.name, kind: cat.kind },
        request: ctx.req,
      });
      return cat;
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), organizationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await expenseModel.deleteCategory(input.id, input.organizationId);
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "expense_category",
        entityId: input.id,
        newValues: { isActive: false },
        request: ctx.req,
      });
      return { success: true };
    }),

  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        status: expenseStatusSchema.optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) => expenseModel.findMany(input)),

  /** Resumo pago / a pagar / atrasado (Cap. 15.2). */
  summary: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(({ input }) => expenseModel.summarize(input.organizationId)),

  history: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), organizationId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const expense = await expenseModel.findById(input.id, input.organizationId);
      if (!expense) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada" });
      }
      return expenseModel.listHistory(input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        expenseCategoryId: z.number().int().positive().optional(),
        payeeName: z.string().max(255).optional(),
        paymentMethodId: z.number().int().positive().optional(),
        installmentNo: z.number().int().min(1).max(48).default(1),
        installmentsTotal: z.number().int().min(1).max(48).default(1),
        amount: z.number().min(0, "Valor não pode ser negativo"),
        status: expenseStatusSchema.default("a_pagar"),
        dueDate: z.string().optional(),
        paidAt: z.string().optional(),
        description: z.string().optional(),
        recurrenceRule: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.installmentsTotal > 1 && input.installmentNo > input.installmentsTotal) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Número da parcela maior que o total",
        });
      }
      const createInput: CreateExpenseInput = { ...input, createdBy: ctx.user.id };
      const expense = await expenseModel.create(createInput);
      await expenseModel.addHistory(expense.id, ctx.user.id, "CREATE", {
        amount: expense.amount,
        status: expense.status,
      });
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "expense",
        entityId: expense.id,
        newValues: { amount: expense.amount, status: expense.status },
        request: ctx.req,
      });
      return expense;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
        amount: z.number().min(0).optional(),
        status: expenseStatusSchema.optional(),
        payeeName: z.string().max(255).optional(),
        dueDate: z.string().optional(),
        paidAt: z.string().optional(),
        description: z.string().optional(),
        expenseCategoryId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const existing = await expenseModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada" });
      }
      if (existing.status === "cancelado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Despesa cancelada não pode ser editada" });
      }
      const expense = await expenseModel.update(id, organizationId, { id, ...data });
      await expenseModel.addHistory(id, ctx.user.id, "UPDATE", data);
      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "expense",
        entityId: id,
        oldValues: { status: existing.status, amount: existing.amount },
        newValues: data,
        request: ctx.req,
      });
      return expense;
    }),

  /** Cancelamento com motivo obrigatório (Cap. 15.2). */
  cancel: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        organizationId: z.number().int().positive(),
        reason: z.string().min(3, "Motivo do cancelamento é obrigatório"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const expense = await expenseModel.cancel(input.id, input.organizationId, ctx.user.id, input.reason);
      if (!expense) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada" });
      }
      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CANCEL",
        entity: "expense",
        entityId: input.id,
        newValues: { status: "cancelado", reason: input.reason },
        request: ctx.req,
      });
      return expense;
    }),
});
