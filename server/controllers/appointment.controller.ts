/**
 * OllCLin - Camada Controller
 * Controlador de Agendamentos (Agenda)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { appointmentModel } from "../models/appointment.model";
import { protectedProcedure, router } from "../_core/trpc";
import { writeAuditLog } from "../lib/audit";

const statusSchema = z.enum([
  "solicitado",
  "confirmado",
  "em_espera",
  "em_atendimento",
  "atendido",
  "faltou",
  "desmarcado",
]);

/** Datas chegam do cliente como ISO string; normaliza para o Postgres. */
const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Data inválida",
  });

export const createAppointmentSchema = z.object({
  organizationId: z.number().int().positive(),
  patientId: z.number().int().positive(),
  professionalId: z.number().int().positive(),
  procedureId: z.number().int().positive(),
  establishmentId: z.number().int().optional(),
  locationId: z.number().int().optional(),
  roomId: z.number().int().optional(),
  startsAt: isoDate,
  endsAt: isoDate,
  status: statusSchema.default("solicitado"),
  notes: z.string().optional(),
});

export const updateAppointmentSchema = z.object({
  id: z.number().int().positive(),
  organizationId: z.number().int().positive(),
  patientId: z.number().int().positive().optional(),
  professionalId: z.number().int().positive().optional(),
  procedureId: z.number().int().positive().optional(),
  establishmentId: z.number().int().optional(),
  locationId: z.number().int().optional(),
  roomId: z.number().int().optional(),
  startsAt: isoDate.optional(),
  endsAt: isoDate.optional(),
  status: statusSchema.optional(),
  notes: z.string().optional(),
});

export const appointmentFilterSchema = z.object({
  organizationId: z.number().int().positive(),
  professionalId: z.number().int().optional(),
  patientId: z.number().int().optional(),
  status: statusSchema.optional(),
  startsAtFrom: z.string().optional(),
  startsAtTo: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().min(0).default(0),
});

export const conflictCheckSchema = z.object({
  professionalId: z.number().int().positive(),
  startsAt: isoDate,
  endsAt: isoDate,
  excludeId: z.number().int().optional(),
  roomId: z.number().int().optional(),
});

export const appointmentRouter = router({
  list: protectedProcedure
    .input(appointmentFilterSchema)
    .query(async ({ input }) => appointmentModel.findMany(input)),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .query(async ({ input }) => {
      const appointment = await appointmentModel.findById(
        input.id,
        input.organizationId,
      );
      if (!appointment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agendamento não encontrado",
        });
      }
      return appointment;
    }),

  create: protectedProcedure
    .input(createAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(input.endsAt);

      if (endsAt <= startsAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O horário final deve ser posterior ao inicial",
        });
      }

      const hasConflict = await appointmentModel.checkConflict({
        professionalId: input.professionalId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        roomId: input.roomId,
      });

      if (hasConflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Conflito de horário: profissional ou sala já possui agendamento neste período",
        });
      }

      const appointment = await appointmentModel.create({
        ...input,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        createdBy: ctx.user.id,
      });

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "CREATE",
        entity: "appointment",
        entityId: appointment.id,
        newValues: {
          patientId: input.patientId,
          professionalId: input.professionalId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: input.status,
        },
        request: ctx.req,
      });

      return appointment;
    }),

  update: protectedProcedure
    .input(updateAppointmentSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, organizationId, startsAt, endsAt, ...data } = input;

      const existing = await appointmentModel.findById(id, organizationId);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agendamento não encontrado",
        });
      }

      const nextStartsAt = startsAt ? new Date(startsAt) : new Date(existing.startsAt);
      const nextEndsAt = endsAt ? new Date(endsAt) : new Date(existing.endsAt);

      if (nextEndsAt <= nextStartsAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O horário final deve ser posterior ao inicial",
        });
      }

      if (startsAt || endsAt || data.professionalId || data.roomId) {
        const hasConflict = await appointmentModel.checkConflict({
          professionalId: data.professionalId ?? existing.professionalId,
          startsAt: nextStartsAt.toISOString(),
          endsAt: nextEndsAt.toISOString(),
          excludeId: id,
          roomId: data.roomId ?? existing.roomId ?? undefined,
        });

        if (hasConflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Conflito de horário: profissional ou sala já possui agendamento neste período",
          });
        }
      }

      const appointment = await appointmentModel.update(id, organizationId, {
        id,
        ...data,
        startsAt: nextStartsAt.toISOString(),
        endsAt: nextEndsAt.toISOString(),
      });

      await writeAuditLog({
        organizationId,
        userId: ctx.user.id,
        action: "UPDATE",
        entity: "appointment",
        entityId: id,
        oldValues: {
          status: existing.status,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
        },
        newValues: {
          status: data.status ?? existing.status,
          startsAt: nextStartsAt.toISOString(),
          endsAt: nextEndsAt.toISOString(),
        },
        request: ctx.req,
      });

      return appointment;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int(), organizationId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const appointment = await appointmentModel.delete(
        input.id,
        input.organizationId,
      );
      if (!appointment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agendamento não encontrado",
        });
      }

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "appointment",
        entityId: input.id,
        newValues: { status: "desmarcado" },
        request: ctx.req,
      });

      return { success: true };
    }),

  checkConflict: protectedProcedure
    .input(conflictCheckSchema)
    .query(async ({ input }) => {
      const hasConflict = await appointmentModel.checkConflict({
        professionalId: input.professionalId,
        startsAt: new Date(input.startsAt).toISOString(),
        endsAt: new Date(input.endsAt).toISOString(),
        excludeId: input.excludeId,
        roomId: input.roomId,
      });

      return { hasConflict };
    }),
});
