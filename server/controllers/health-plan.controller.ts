/**
 * OllCLin - Camada Controller
 * Controlador de Convênios (health_plans)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  healthPlanModel,
  type CreateHealthPlanInput,
  type HealthPlan,
} from "../models/health-plan.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

export const createHealthPlanSchema = z.object({
  organizationId: z.number().int().positive(),
  operatorName: z.string().min(2, "Nome da operadora é obrigatório"),
  ansCode: z.string().max(20).optional(),
  tissXmlVersion: z.string().max(20).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
  notes: z.string().optional(),
});

export const updateHealthPlanSchema = z.object({
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  operatorName: z.string().min(2).optional(),
  ansCode: z.string().max(20).optional(),
  tissXmlVersion: z.string().max(20).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const healthPlanRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        search: z.string().optional(),
        isActive: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input }) => healthPlanModel.findMany(input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const plan = await healthPlanModel.findById(input.id, input.organizationId);
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Convênio não encontrado" });
      }
      return plan;
    }),

  create: protectedProcedure
    .input(createHealthPlanSchema)
    .mutation(async ({ ctx, input }): Promise<HealthPlan> => {
      const createInput: CreateHealthPlanInput = { ...input };
      const plan = await healthPlanModel.create(createInput);

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "health_plan",
        entityId: plan.id,
        newValues: { operatorName: plan.operatorName, ansCode: plan.ansCode },
        request: ctx.req,
      });

      return plan;
    }),

  update: protectedProcedure
    .input(updateHealthPlanSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, ...data } = input;
      const existing = await healthPlanModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Convênio não encontrado" });
      }

      const plan = await healthPlanModel.update(id, organizationId, { id, ...data });

      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "health_plan",
        entityId: id,
        oldValues: { operatorName: existing.operatorName, isActive: existing.isActive },
        newValues: data,
        request: ctx.req,
      });

      return plan;
    }),

  /** REQ-05-004: exclusão como soft delete (is_active = false). */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await healthPlanModel.softDelete(input.id, input.organizationId);
      if (!plan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Convênio não encontrado" });
      }

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "health_plan",
        entityId: input.id,
        newValues: { isActive: false },
        request: ctx.req,
      });

      return { success: true };
    }),
});
