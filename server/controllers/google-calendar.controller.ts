/**
 * OllCLin - Camada Controller
 * Controlador da integração com o Google Calendar
 *
 * O navegador nunca recebe tokens do Google: o fluxo OAuth acontece no
 * servidor (rota /api/google-calendar/callback) e estas procedures apenas
 * disparam ações em nome do usuário autenticado.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { appointmentModel, type Appointment } from "../models/appointment.model";
import { googleCalendarModel } from "../models/google-calendar.model";
import { writeAuditLog } from "../lib/audit";
import {
  GoogleCalendarError,
  buildAuthUrl,
  createEvent,
  createOAuthState,
  deleteEvent,
  getGoogleConfig,
  googleTimeZone,
  isGoogleCalendarConfigured,
  listEvents,
  toGoogleDateTime,
  updateEvent,
  type GoogleEventInput,
} from "../lib/google-calendar";
import {
  getSchemaCapabilities,
  MIGRATION_0004_HINT,
} from "../lib/schema-capabilities";

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

/**
 * Monta o evento do Google a partir do agendamento.
 *
 * LGPD: enviamos apenas o necessário para a agenda do próprio profissional
 * (nome do paciente, procedimento e observações já cadastradas). Nenhum dado
 * clínico adicional é incluído.
 */
function buildEventPayload(
  appointment: Appointment,
  timeZone: string,
): GoogleEventInput {
  const patientName = appointment.patient?.fullName ?? `Paciente #${appointment.patientId}`;
  const procedureName = appointment.procedure?.name ?? "Atendimento";
  const description = [
    appointment.professional?.fullName
      ? `Profissional: ${appointment.professional.fullName}`
      : null,
    appointment.notes ? `Observações: ${appointment.notes}` : null,
    `OllCLin • Agendamento #${appointment.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    summary: `${procedureName} — ${patientName}`.slice(0, 250),
    description: description.slice(0, 2000),
    start: {
      dateTime: toGoogleDateTime(appointment.startsAt),
      timeZone,
    },
    end: {
      dateTime: toGoogleDateTime(appointment.endsAt),
      timeZone,
    },
    extendedProperties: {
      private: {
        ollclin_appointment_id: String(appointment.id),
        ollclin_organization_id: String(appointment.organizationId),
      },
    },
  };
}

type GoogleAuth = { accessToken: string; calendarId: string };

type SyncResult = {
  appointmentId: number;
  eventId: string;
  action: "created" | "updated";
  htmlLink?: string;
};

/**
 * Cria ou atualiza o evento do agendamento no Google.
 * Se o evento tiver sido apagado manualmente no Google (404/410), recria.
 */
async function syncAppointmentWithAuth(
  auth: GoogleAuth,
  appointment: Appointment,
): Promise<SyncResult> {
  const payload = buildEventPayload(appointment, googleTimeZone());
  const existingId = appointment.googleCalendarEventId;

  if (existingId) {
    try {
      const updated = await updateEvent(
        auth.accessToken,
        existingId,
        payload,
        auth.calendarId,
      );
      return {
        appointmentId: appointment.id,
        eventId: updated.id,
        action: "updated",
        htmlLink: updated.htmlLink,
      };
    } catch (error) {
      if (
        error instanceof GoogleCalendarError &&
        (error.status === 404 || error.status === 410)
      ) {
        // Evento removido fora do OllCLin: cria um novo e atualiza o vínculo.
      } else {
        throw error;
      }
    }
  }

  const created = await createEvent(auth.accessToken, payload, auth.calendarId);
  await googleCalendarModel.setEventId(
    appointment.organizationId,
    appointment.id,
    created.id,
  );
  return {
    appointmentId: appointment.id,
    eventId: created.id,
    action: "created",
    htmlLink: created.htmlLink,
  };
}

async function requireAuth(
  organizationId: number,
  userId: number,
): Promise<GoogleAuth> {
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
  connectUrl: protectedProcedure
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
  disconnect: protectedProcedure
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
        maxResults: z.number().int().min(1).max(2500).optional(),
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
          maxResults: input.maxResults,
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

  /** Sincroniza um agendamento com o Google (cria ou atualiza o evento). */
  syncAppointment: protectedProcedure
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

        const auth = await requireAuth(input.organizationId, ctx.user.id);
        const result = await syncAppointmentWithAuth(auth, appointment);

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "appointment",
          entityId: appointment.id,
          newValues: {
            googleCalendarEventId: result.eventId,
            googleAction: result.action,
          },
          request: ctx.req,
        });

        return result;
      } catch (error) {
        throw asTrpcError(error, "Falha ao sincronizar o agendamento");
      }
    }),

  /** Remove o evento do Google e desfaz o vínculo com o agendamento. */
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

        if (appointment.googleCalendarEventId) {
          const auth = await requireAuth(input.organizationId, ctx.user.id);
          await deleteEvent(
            auth.accessToken,
            appointment.googleCalendarEventId,
            auth.calendarId,
          );
        }

        await googleCalendarModel.setEventId(
          input.organizationId,
          appointment.id,
          null,
        );

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "appointment",
          entityId: appointment.id,
          newValues: { googleCalendarEventId: null },
          request: ctx.req,
        });

        return { appointmentId: appointment.id, removed: true };
      } catch (error) {
        throw asTrpcError(error, "Falha ao remover o evento do Google");
      }
    }),

  /** Sincroniza todos os agendamentos do período (OllCLin → Google). */
  syncRange: protectedProcedure
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
        const auth = await requireAuth(input.organizationId, ctx.user.id);
        const appointments = await appointmentModel.findByPeriod(
          input.organizationId,
          input.from,
          input.to,
        );
        const batch = appointments.slice(0, MAX_SYNC_BATCH);

        let synced = 0;
        let skipped = 0;
        let failed = 0;
        const errors: Array<{ appointmentId: number; message: string }> = [];
        const results: SyncResult[] = [];

        for (const appointment of batch) {
          if (appointment.status === "desmarcado") {
            if (appointment.googleCalendarEventId) {
              try {
                await deleteEvent(
                  auth.accessToken,
                  appointment.googleCalendarEventId,
                  auth.calendarId,
                );
              } catch (error) {
                // O evento pode já ter sido removido no Google: segue em frente.
                if (!(error instanceof GoogleCalendarError && error.status === 404)) {
                  errors.push({
                    appointmentId: appointment.id,
                    message:
                      error instanceof Error ? error.message : "Erro desconhecido",
                  });
                }
              }
            }
            await googleCalendarModel.setEventId(
              input.organizationId,
              appointment.id,
              null,
            );
            skipped += 1;
            continue;
          }

          try {
            const result = await syncAppointmentWithAuth(auth, appointment);
            results.push(result);
            synced += 1;
          } catch (error) {
            failed += 1;
            errors.push({
              appointmentId: appointment.id,
              message: error instanceof Error ? error.message : "Erro desconhecido",
            });
          }
        }

        await writeAuditLog({
          organizationId: input.organizationId,
          userId: ctx.user.id,
          action: "UPDATE",
          entity: "appointment",
          newValues: {
            googleSyncRange: { from: input.from, to: input.to },
            synced,
            skipped,
            failed,
          },
          request: ctx.req,
        });

        return {
          requested: appointments.length,
          processed: batch.length,
          synced,
          skipped,
          failed,
          truncated: appointments.length > batch.length,
          errors,
          results,
        };
      } catch (error) {
        throw asTrpcError(error, "Falha ao sincronizar o período");
      }
    }),
});
