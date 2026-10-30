/**
 * OllCLin - Camada Controller
 * Controlador de Procedimentos
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { procedureModel } from "../models/procedure.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

export const createProcedureSchema = z.object({
  organizationId: z.number().int().positive(),
  name: z.string().min(2, "Nome do procedimento é obrigatório"),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().default(30),
  price: z.string().default("0.00"),
  isActive: z.boolean().default(true),
});

export const updateProcedureSchema = z.object({
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  price: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const procedureFilterSchema = z.object({
  organizationId: z.number().int().positive(),
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const procedureRouter = router({
  list: protectedProcedure
    .input(procedureFilterSchema)
    .query(async ({ input }) => procedureModel.findMany(input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const procedure = await procedureModel.findById(
        input.id,
        input.organizationId,
      );
      if (!procedure) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Procedimento não encontrado",
        });
      }
      return procedure;
    }),

  create: protectedProcedure
    .input(createProcedureSchema)
    .mutation(async ({ ctx, input }) => {
      const procedure = await procedureModel.create(input);

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "procedure",
        entityId: procedure.id,
        newValues: { name: input.name, price: input.price },
        request: ctx.req,
      });

      return procedure;
    }),

  update: protectedProcedure
    .input(updateProcedureSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;

      const existing = await procedureModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Procedimento não encontrado",
        });
      }

      const procedure = await procedureModel.update(id, organizationId, {
        id,
        ...data,
      });

      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "procedure",
        entityId: id,
        oldValues: existing,
        newValues: data,
        request: ctx.req,
      });

      return procedure;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const procedure = await procedureModel.delete(
        input.id,
        input.organizationId,
      );
      if (!procedure) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Procedimento não encontrado",
        });
      }

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "procedure",
        entityId: input.id,
        newValues: { isActive: false },
        request: ctx.req,
      });

      return { success: true };
    }),
});
