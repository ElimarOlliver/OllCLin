/**
 * OllCLin - Camada Controller
 * Controlador de Procedimentos
 * Arquitetura MVC - Recebe requisições, valida e chama o Model
 */

import { z } from "zod";
import { procedureModel } from "../models/procedure.model";
import { publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const createProcedureSchema = z.object({
  organizationId: z.number(),
  name: z.string().min(2, "Nome do procedimento é obrigatório"),
  description: z.string().optional(),
  durationMinutes: z.number().default(30),
  price: z.string().default("0.00"),
  isActive: z.boolean().default(true),
});

export const updateProcedureSchema = z.object({
  id: z.number(),
  organizationId: z.number(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  durationMinutes: z.number().optional(),
  price: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const procedureFilterSchema = z.object({
  organizationId: z.number(),
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().default(50).optional(),
  offset: z.number().default(0).optional(),
});

export const procedureRouter = {
  list: publicProcedure
    .input(procedureFilterSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return await procedureModel.findMany({
        organizationId: input.organizationId,
        search: input.search,
        isActive: input.isActive,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: publicProcedure
    .input(z.object({ id: z.number(), organizationId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const procedure = await procedureModel.findById(
        input.id,
        input.organizationId,
      );
      if (!procedure) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Procedimento não encontrado" });
      }

      return procedure;
    }),

  create: protectedProcedure
    .input(createProcedureSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return await procedureModel.create(input);
    }),

  update: protectedProcedure
    .input(updateProcedureSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const { id, organizationId, ...data } = input;

      const existing = await procedureModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Procedimento não encontrado" });
      }

      return await procedureModel.update(id, organizationId, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), organizationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return await procedureModel.delete(input.id, input.organizationId);
    }),
};