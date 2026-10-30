/**
 * OllCLin - Camada Controller
 * Controlador de Profissionais de Saúde
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { professionalModel } from "../models/professional.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

export const createProfessionalSchema = z.object({
  organizationId: z.number().int().positive(),
  userId: z.number().int().optional(),
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
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  userId: z.number().int().optional(),
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
  organizationId: z.number().int().positive(),
  search: z.string().optional(),
  specialty: z.string().optional(),
  isActive: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const professionalRouter = router({
  list: protectedProcedure
    .input(professionalFilterSchema)
    .query(async ({ input }) => professionalModel.findMany(input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const professional = await professionalModel.findById(
        input.id,
        input.organizationId,
      );
      if (!professional) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profissional não encontrado",
        });
      }
      return professional;
    }),

  create: protectedProcedure
    .input(createProfessionalSchema)
    .mutation(async ({ ctx, input }) => {
      const professional = await professionalModel.create(input);

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "professional",
        entityId: professional.id,
        newValues: { fullName: input.fullName, specialty: input.specialty },
        request: ctx.req,
      });

      return professional;
    }),

  update: protectedProcedure
    .input(updateProfessionalSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;

      const existing = await professionalModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profissional não encontrado",
        });
      }

      const professional = await professionalModel.update(id, organizationId, {
        id,
        ...data,
      });

      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "professional",
        entityId: id,
        oldValues: existing,
        newValues: data,
        request: ctx.req,
      });

      return professional;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const professional = await professionalModel.delete(
        input.id,
        input.organizationId,
      );
      if (!professional) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Profissional não encontrado",
        });
      }

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "professional",
        entityId: input.id,
        newValues: { isActive: false },
        request: ctx.req,
      });

      return { success: true };
    }),
});
