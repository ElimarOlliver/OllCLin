/**
 * OllCLin - Camada Controller
 * Controlador da integração com o Google Calendar
 *
 * Fase 2 (SaaS): as mutações de agendamento passam a ENFILEIRAR jobs na fila
 * (`calendar_sync_jobs`) em vez de chamar o Google Calendar síncronamente.
 * O worker (`server/services/google-sync.worker.ts`) executa a operação com
 * idempotência, retry e backoff.
 *
 * O navegador nunca recebe tokens do Google: o fluxo OAuth acontece no
 * servidor (rota /api/google-calendar/callback) e estas procedures apenas
 * disparam ações em nome do usuário autenticado.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, protectedWith, router } from "../_core/trpc";
import { appointmentModel, type Appointment } from "../models/appointment.model";
import { googleCalendarModel } from "../models/google-calendar.model";
import { googleCalendarSyncModel } from "../models/google-calendar-sync.model";
import { enqueueAppointmentSync, pullGoogleRangeForUser } from "../services/google-calendar-sync.service";
import { writeAuditLog } from "../lib/audit";
import {
  GoogleCalendarError,
  buildAuthUrl,
  createOAuthState,
  getGoogleConfig,
  isGoogleCalendarConfigured,
  listEvents,
} from "../lib/google-calendar";
import { getSchemaCapabilities, MIGRATION_0004_HINT } from "../lib/schema-capabilities";

/** Margem máxima de agendamentos sincronizados por chamada. */
const MAX_SYNC_BATCH = 300;

function asTrpcError(error: unknown, fallback: string): TRPCError {
  if (error instanceof TRPCError) return error;
  const message = error instanceof Error ? error.message : fallback;
  const code =
    /migração|não configurado|conecte/i.test(message)
      ? "PRECONDITION_FAILED"
      : "BAD_REQUEST";
  return new TRPCError({ code, message });
}

/** Garante que o usuário só opera na própria organização (tenant). */
function assertOrganization(
  userOrganizationId: number | null | undefined,
  organizationId: number,
) {
  if (userOrganizationId && userOrganizationId !== organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não tem acesso a esta organização",
    });
  }
}

function parseRange(from: string, to: string): { timeMin: string; timeMax: string } {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Período inválido" });
  }
  if (end <= start) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A data final deve ser posterior à inicial",
    });
  }
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/** Versão do agendamento usada na chave de idempotência da fila. */
function syncVersion(appointment: Appointment): string {
  const updatedAt = appointment.updatedAt ?? appointment.createdAt;
  return updatedAt ? String(updatedAt) : `${appointment.startsAt}|${appointment.endsAt}|${appointment.status}`;
}

async function requireAuth(
  organizationId: number,
  userId: number,
): Promise<{ accessToken: string; calendarId: string }> {
  const auth = await googleCalendarModel.getAccessToken(organizationId, userId);
  if (!auth) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Google Calendar não conectado. Clique em \"Conectar Google\" na Agenda para autorizar o acesso.",
    });
  }
  return auth;
}

export const googleAgendaRouter = router({
  /** Situação da conexão do usuário (não expõe tokens). */
  status: protectedProcedure
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);

      const caps = await getSchemaCapabilities();
      const config = getGoogleConfig();
      const base = {
        provider: "google" as const,
        configured: isGoogleCalendarConfigured(),
        redirectUri: config.redirectUri,
        timeZone: config.timeZone,
        userEmail: ctx.user.email ?? null,
        migrationRequired: !caps.googleCalendar,
        hint: caps.googleCalendar ? null : MIGRATION_0004_HINT,
      };

      if (!caps.googleCalendar) {
        return {
          ...base,
          connected: false,
          calendarId: null,
          connectedAt: null,
          scope: null,
        };
      }

      const account = await googleCalendarModel.findActive(
        input.organizationId,
        ctx.user.id,
      );

      return {
        ...base,
        connected: Boolean(account),
        calendarId: account?.calendarId ?? null,
        connectedAt: account?.connectedAt ?? null,
        scope: account?.scope ?? null,
      };
    }),

  /** URL de consentimento do Google (state assinado, validade de 10 min). */
  connectUrl: protectedWith("google_calendar.connect")
    .input(z.object({ organizationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);

      const caps = await getSchemaCapabilities();
      if (!caps.googleCalendar) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: MIGRATION_0004_HINT,
        });
      }
      if (!isGoogleCalendarConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Google Calendar não configurado: informe credenciais reais (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET) no .env do servidor.",
        });
      }

      const state = createOAuthState({
        userId: ctx.user.id,
        organizationId: input.organizationId,
      });

      return {
        url: buildAuthUrl(state),
        redirectUri: getGoogleConfig().redirectUri,
      };
    }),

  /** Desconecta a conta Google e revoga o token (LGPD). */
  disconnect: protectedWith("google_calendar.connect")
    .input(z.object({ organizationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);
      await googleCalendarModel.disconnect(input.organizationId, ctx.user.id);

      await writeAuditLog({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        action: "DELETE",
        entity: "google_calendar_account",
        newValues: { revoked: true },
        request: ctx.req,
      });

      return { connected: false };
    }),

  /** Eventos do Google no período (somente leitura). */
  listEvents: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        from: z.string().min(10, "Informe a data inicial"),
        to: z.string().min(10, "Informe a data final"),
        max_results: z.number().int().min(1).max(2500).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);
      const { timeMin, timeMax } = parseRange(input.from, input.to);

      try {
        const auth = await requireAuth(input.organizationId, ctx.user.id);
        const events = await listEvents(auth.accessToken, {
          timeMin,
          timeMax,
          calendarId: auth.calendarId,
          maxResults: input.max_results,
        });
        return events.map((event) => ({
          id: event.id,
          summary: event.summary ?? "(sem título)",
          description: event.description ?? null,
          location: event.location ?? null,
          status: event.status ?? null,
          htmlLink: event.htmlLink ?? null,
          start: event.start,
          end: event.end,
        }));
      } catch (error) {
        throw asTrpcError(error, "Falha ao listar eventos do Google Calendar");
      }
    }),

  /**
   * Enfileira sincronização de um agendamento no Google Calendar (Fase 2).
   * A operação (create/update/delete) é derivada do estado do agendamento.
   */
  syncAppointment: protectedWith("google_calendar.connect")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        appointmentId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);

      try {
        const appointment = await appointmentModel.findById(
          input.appointmentId,
          input.organizationId,
        );
        if (!appointment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Agendamento não encontrado",
          });
        }
        if (appointment.status === "desmarcado") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Agendamento desmarcado não pode ser sincronizado",
          });
        }

        const operation =
          appointment.googleCalendarEventId === null ? "create" : "update";
        const job = await enqueueAppointmentSync({
          organizationId: input.organizationId,
          appointmentId: appointment.id,
          userId: ctx.user.id,
          operation,
          version: syncVersion(appointment),
        });

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "appointment",
          entityId: appointment.id,
          newValues: {
            googleSyncOperation: job.operation,
            googleSyncStatus: job.status,
          },
          request: ctx.req,
        });

        return {
          appointmentId: appointment.id,
          queued: true,
          job: {
            id: job.id,
            status: job.status,
            operation: job.operation,
            idempotencyKey: job.idempotencyKey,
            attempts: job.attempts,
          },
        };
      } catch (error) {
        throw asTrpcError(error, "Falha ao enfileirar sincronização com o Google Calendar");
      }
    }),

  /** Remove o evento do Google e desfaz o vínculo com o agendamento (via fila). */
  removeAppointment: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        appointmentId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);

      try {
        const appointment = await appointmentModel.findById(
          input.appointmentId,
          input.organizationId,
        );
        if (!appointment) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Agendamento não encontrado",
          });
        }

        const job = await enqueueAppointmentSync({
          organizationId: input.organizationId,
          appointmentId: appointment.id,
          userId: ctx.user.id,
          operation: "delete",
          version: syncVersion(appointment),
        });

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "appointment",
          entityId: appointment.id,
          newValues: { googleCalendarEventId: null, googleSyncOperation: "delete" },
          request: ctx.req,
        });

        return { appointmentId: appointment.id, queued: true, job };
      } catch (error) {
        throw asTrpcError(error, "Falha ao enfileirar remoção do Google Calendar");
      }
    }),

  /**
   * Enfileira sincronização em lote de um período (OllCLin → Google).
   * Agendamentos desmarcadados geram job de remoção (delete).
   */
  syncRange: protectedWith("google_calendar.connect")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        from: z.string().min(10, "Informe a data inicial"),
        to: z.string().min(10, "Informe a data final"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);
      parseRange(input.from, input.to); // valida o período

      try {
        const appointments = await appointmentModel.findByPeriod(
          input.organizationId,
          input.from,
          input.to,
        );
        const batch = appointments.slice(0, MAX_SYNC_BATCH);

        let queued = 0;
        let skipped = 0;
        for (const appointment of batch) {
          const operation = appointment.status === "desmarcado" ? "delete" : appointment.googleCalendarEventId === null ? "create" : "update";
          const job = await enqueueAppointmentSync({
            organizationId: input.organizationId,
            appointmentId: appointment.id,
            userId: ctx.user.id,
            operation,
            version: syncVersion(appointment),
          });
          queued += 1;
          if (operation === "delete") skipped += 1;
        }

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "appointment",
          newValues: {
            googleSyncRange: { from: input.from, to: input.to },
            queued,
            skipped,
          },
          request: ctx.req,
        });

        return { requested: appointments.length, queued, skipped };
      } catch (error) {
        throw asTrpcError(error, "Falha ao enfileirar sincronização do período");
      }
    }),

  /** Histórico recente de jobs de sincronização (estados: pending/processing/done/failed). */
  syncJobs: protectedWith("google_calendar.connect")
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);
      const jobs = await googleCalendarSyncModel.findByOrganization(
        input.organizationId,
        input.limit,
      );
      return jobs.map((job) => ({
        id: job.id,
        organizationId: job.organizationId,
        appointmentId: job.appointmentId,
        userId: job.userId,
        operation: job.operation,
        idempotencyKey: job.idempotencyKey,
        attempts: job.attempts,
        status: job.status,
        nextAttemptAt: job.nextAttemptAt,
        lastError: job.lastError,
        createdAt: job.createdAt ?? undefined,
        updatedAt: job.updatedAt ?? undefined,
      }));
    }),

  /** Reconcile alterações feitas diretamente no Google Calendar → OllCLin. */
  pullRange: protectedProcedure
    .input(
      z.object({
        organizationId: z.number().int().positive(),
        from: z.string().min(10),
        to: z.string().min(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOrganization(ctx.user.organizationId, input.organizationId);
      parseRange(input.from, input.to);
      try {
        const result = await pullGoogleRangeForUser({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          from: input.from,
          to: input.to,
        });
        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "appointment",
          newValues: { googlePullRange: input, result },
          request: ctx.req,
        });
        return result;
      } catch (error) {
        throw asTrpcError(error, "Falha ao importar alterações do Google Calendar");
      }
    }),
});
