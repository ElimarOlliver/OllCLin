/**
 * OllCLin - Camada Controller
 * Controlador de Agendamentos
 * Arquitetura MVC - Recebe requisições, valida e chama o Model
 */

import { z } from "zod";
import { appointmentModel } from "../models/appointment.model";
import { publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { auditLog } from "../../drizzle/schema";
import { db } from "../db";

// Schemas de validação
export const createAppointmentSchema = z.object({
  organizationId: z.number(),
  patientId: z.number(),
  professionalId: z.number(),
  procedureId: z.number(),
  establishmentId: z.number().optional(),
  locationId: z.number().optional(),
  roomId: z.number().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  status: z
    .enum([
      "solicitado",
      "confirmado",
      "em_espera",
      "em_atendimento",
      "atendido",
      "faltou",
      "desmarcado",
    ])
    .default("solicitado"),
  notes: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  id: z.number(),
  organizationId: z.number(),
  patientId: z.number().optional(),
  professionalId: z.number().optional(),
  procedureId: z.number().optional(),
  establishmentId: z.number().optional(),
  locationId: z.number().optional(),
  roomId: z.number().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  status: z
    .enum([
      "solicitado",
      "confirmado",
      "em_espera",
      "em_atendimento",
      "atendido",
      "faltou",
      "desmarcado",
    ])
    .optional(),
  notes: z.string().optional(),
});

export const appointmentFilterSchema = z.object({
  organizationId: z.number(),
  professionalId: z.number().optional(),
  patientId: z.number().optional(),
  status: z.string().optional(),
  startsAtFrom: z.string().datetime().optional(),
  startsAtTo: z.string().datetime().optional(),
  limit: z.number().default(50).optional(),
  offset: z.number().default(0).optional(),
});

export const conflictCheckSchema = z.object({
  professionalId: z.number(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  excludeId: z.number().optional(),
  roomId: z.number().optional(),
});

export const appointmentRouter = {
  list: publicProcedure
    .input(appointmentFilterSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      return await appointmentModel.findMany({
        organizationId: input.organizationId,
        professionalId: input.professionalId,
        patientId: input.patientId,
        status: input.status,
        startsAtFrom: input.startsAtFrom ? new Date(input.startsAtFrom) : undefined,
        startsAtTo: input.startsAtTo ? new Date(input.startsAtTo) : undefined,
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

      const appointment = await appointmentModel.findById(
        input.id,
        input.organizationId,
      );
      if (!appointment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
      }

      return appointment;
    }),

  create: protectedProcedure
    .input(createAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      // Verificar conflito de horário para o profissional
      const hasConflict = await appointmentModel.checkConflict({
        professionalId: input.professionalId,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        roomId: input.roomId,
      });

      if (hasConflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Conflito de horário: profissional ou sala já possui agendamento neste período",
        });
      }

      const appointment = await appointmentModel.create({
        ...input,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        createdBy: ctx.user.id,
      });

      // Auditoria
      await db.insert(auditLog).values({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "appointment",
        entityId: appointment.id,
        newValues: JSON.stringify({
          patientId: input.patientId,
          professionalId: input.professionalId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: input.status,
        }),
        ipAddress: ctx.req.headers["x-forwarded-for"] as string | undefined,
        userAgent: ctx.req.headers["user-agent"],
      });

      return appointment;
    }),

  update: protectedProcedure
    .input(updateAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const { id, organizationId, startsAt, endsAt, ...data } = input;

      const existing = await appointmentModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
      }

      // Verificar conflito se mudou horário ou profissional
      if (startsAt || endsAt || data.professionalId || data.roomId) {
        const hasConflict = await appointmentModel.checkConflict({
          professionalId: data.professionalId ?? existing.professionalId,
          startsAt: startsAt ? new Date(startsAt) : existing.startsAt,
          endsAt: endsAt ? new Date(endsAt) : existing.endsAt,
          excludeId: id,
          roomId: data.roomId ?? existing.roomId,
        });

        if (hasConflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Conflito de horário: profissional ou sala já possui agendamento neste período",
          });
        }
      }

      const oldValues = JSON.stringify({
        status: existing.status,
        startsAt: existing.startsAt,
        endsAt: existing.endsAt,
        professionalId: existing.professionalId,
        roomId: existing.roomId,
      });

      const appointment = await appointmentModel.update(id, organizationId, {
        ...data,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
      });

      const newValues = JSON.stringify({
        status: data.status,
        startsAt: startsAt,
        endsAt: endsAt,
        professionalId: data.professionalId,
        roomId: data.roomId,
      });

      await db.insert(auditLog).values({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "appointment",
        entityId: id,
        oldValues,
        newValues,
        ipAddress: ctx.req.headers["x-forwarded-for"] as string | undefined,
        userAgent: ctx.req.headers["user-agent"],
      });

      return appointment;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), organizationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const appointment = await appointmentModel.delete(input.id, input.organizationId);
      if (!appointment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Agendamento não encontrado" });
      }

      await db.insert(auditLog).values({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "appointment",
        entityId: input.id,
        newValues: JSON.stringify({ status: "desmarcado" }),
        ipAddress: ctx.req.headers["x-forwarded-for"] as string | undefined,
        userAgent: ctx.req.headers["user-agent"],
      });

      return { success: true };
    }),

  checkConflict: publicProcedure
    .input(conflictCheckSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      }

      const hasConflict = await appointmentModel.checkConflict({
        professionalId: input.professionalId,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        excludeId: input.excludeId,
        roomId: input.roomId,
      });

      return { hasConflict };
    }),
};