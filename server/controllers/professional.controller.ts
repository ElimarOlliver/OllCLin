/**
 * OllCLin - Camada Controller
 * Controlador de Profissionais de Saúde
 * Arquitetura MVC - Recebe requisições, valida e chama o Model
 */

import { z } from "zod";
import { professionalModel } from "../models/professional.model";
import { publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const createProfessionalSchema = z.object({
  organizationId: z.number(),
  userId: z.number().optional(),
  fullName: z.string().min(2, "Nome completo é obrigatório"),
  cpf: z.string().optional(),
  council: z.string().optional(),
  councilNumber: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().default(true),
});

export const updateProfessionalSchema = z.object({
  id: z.number(),
  organizationId: z.number(),
  fullName: z.string().min(2).optional(),
  cpf: z.string().optional(),
  council: z.string().optional(),
  councilNumber: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
});

export const professionalFilterSchema = z.object({
  organizationId: z.number(),
  search: z.string().optional(),
  specialty: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().default(50).optional(),
  offset: z.number().default(0).optional(),
});

export const professionalRouter = {
  list: publicProcedure
    .input(professionalFilterSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return await professionalModel.findMany({
        organizationId: input.organizationId,
        search: input.search,
        specialty: input.specialty,
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

      const professional = await professionalModel.findById(
        input.id,
        input.organizationId,
      );
      if (!professional) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profissional não encontrado" });
      }

      return professional;
    }),

  create: protectedProcedure
    .input(createProfessionalSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return await professionalModel.create(input);
    }),

  update: protectedProcedure
    .input(updateProfessionalSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const { id, organizationId, ...data } = input;

      const existing = await professionalModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Profissional não encontrado" });
      }

      return await professionalModel.update(id, organizationId, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), organizationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return await professionalModel.delete(input.id, input.organizationId);
    }),
};