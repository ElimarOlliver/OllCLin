import { getSupabaseAdmin } from "../lib/supabase-server";
import {
  createEvent,
  deleteEvent,
  GoogleCalendarError,
  googleTimeZone,
  listEvents,
  toGoogleDateTime,
  updateEvent,
  type GoogleEventInput,
} from "../lib/google-calendar";
import { googleCalendarModel } from "../models/google-calendar.model";
import {
  googleCalendarSyncModel,
  type CalendarSyncJob,
  type SyncOperation,
} from "../models/google-calendar-sync.model";
import { appointmentModel, type Appointment } from "../models/appointment.model";

export type GoogleSyncResult =
  | { status: "created" | "updated"; eventId: string; htmlLink?: string }
  | { status: "removed" }
  | { status: "not_connected" }
  | { status: "skipped" }
  | { status: "conflict"; message: string };

/** Resultado da operação de pull/reconcile (Google → OllCLin). */
export type PullSyncResult = {
  status: "updated" | "not_connected";
  updated: number;
  conflicts: string[];
};

export class GoogleCalendarConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleCalendarConflictError";
  }
}

function payloadFor(appointment: Appointment): GoogleEventInput {
  const patientName = appointment.patient?.fullName ?? `Paciente #${appointment.patientId}`;
  const procedureName = appointment.procedure?.name ?? "Atendimento";
  return {
    summary: `${procedureName} — ${patientName}`.slice(0, 250),
    description: [
      appointment.professional?.fullName ? `Profissional: ${appointment.professional.fullName}` : null,
      appointment.notes ? `Observações: ${appointment.notes}` : null,
      `OllCLin • Agendamento #${appointment.id}`,
    ].filter(Boolean).join("\n").slice(0, 2000),
    start: { dateTime: toGoogleDateTime(appointment.startsAt), timeZone: googleTimeZone() },
    end: { dateTime: toGoogleDateTime(appointment.endsAt), timeZone: googleTimeZone() },
    extendedProperties: { private: { ollclin_appointment_id: String(appointment.id), ollclin_organization_id: String(appointment.organizationId) } },
  };
}

async function findLink(organizationId: number, appointmentId: number, userId: number) {
  const { data, error } = await getSupabaseAdmin()
    .from("appointment_google_events")
    .select("event_id, calendar_id")
    .eq("organization_id", organizationId)
    .eq("appointment_id", appointmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao consultar vínculo Google: ${error.message}`);
  return data as { event_id: string; calendar_id: string } | null;
}

async function saveLink(input: { organizationId: number; appointmentId: number; userId: number; eventId: string; calendarId: string }) {
  const { error } = await getSupabaseAdmin().from("appointment_google_events").upsert({
    organization_id: input.organizationId,
    appointment_id: input.appointmentId,
    user_id: input.userId,
    event_id: input.eventId,
    calendar_id: input.calendarId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "appointment_id,user_id" });
  if (error) throw new Error(`Falha ao salvar vínculo Google: ${error.message}`);
}

async function clearLink(organizationId: number, appointmentId: number, userId: number) {
  const { error } = await getSupabaseAdmin().from("appointment_google_events")
    .delete().eq("organization_id", organizationId).eq("appointment_id", appointmentId).eq("user_id", userId);
  if (error) throw new Error(`Falha ao remover vínculo Google: ${error.message}`);
}

async function assertNoGoogleConflict(accessToken: string, calendarId: string, appointment: Appointment, existingEventId?: string | null) {
  const start = new Date(appointment.startsAt);
  const end = new Date(appointment.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  const events = await listEvents(accessToken, {
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: 250,
  });
  const conflict = events.find((event) => {
    if (event.id === existingEventId || event.status === "cancelled") return false;
    const eventStart = new Date(event.start.dateTime ?? `${event.start.date}T00:00:00`);
    const eventEnd = new Date(event.end.dateTime ?? `${event.end.date}T23:59:59`);
    return eventStart < end && eventEnd > start;
  });
  if (conflict) {
    throw new GoogleCalendarConflictError(
      `Conflito no Google Calendar: o horário coincide com “${conflict.summary ?? "outro evento"}”.`,
    );
  }
}

export async function syncAppointmentForUser(appointment: Appointment, userId: number): Promise<GoogleSyncResult> {
  if (appointment.status === "desmarcado") return removeAppointmentForUser(appointment, userId);
  const auth = await googleCalendarModel.getAccessToken(appointment.organizationId, userId);
  if (!auth) return { status: "not_connected" };
  const link = await findLink(appointment.organizationId, appointment.id, userId);
  const existingEventId = link?.event_id ?? null;
  await assertNoGoogleConflict(auth.accessToken, auth.calendarId, appointment, existingEventId);
  const payload = payloadFor(appointment);
  let event;
  let status: "created" | "updated" = existingEventId ? "updated" : "created";
  if (existingEventId) {
    try {
      event = await updateEvent(auth.accessToken, existingEventId, payload, auth.calendarId);
    } catch (error) {
      if (!(error instanceof GoogleCalendarError && (error.status === 404 || error.status === 410))) throw error;
      status = "created";
      event = await createEvent(auth.accessToken, payload, auth.calendarId);
    }
  } else {
    event = await createEvent(auth.accessToken, payload, auth.calendarId);
  }
  await saveLink({ organizationId: appointment.organizationId, appointmentId: appointment.id, userId, eventId: event.id, calendarId: auth.calendarId });
  return { status, eventId: event.id, htmlLink: event.htmlLink };
}

export async function removeAppointmentForUser(appointment: Appointment, userId: number): Promise<GoogleSyncResult> {
  const link = await findLink(appointment.organizationId, appointment.id, userId);
  const auth = await googleCalendarModel.getAccessToken(appointment.organizationId, userId);
  if (!auth) {
    if (link) await clearLink(appointment.organizationId, appointment.id, userId);
    return { status: "not_connected" };
  }
  const eventId = link?.event_id ?? (appointment.googleCalendarEventId ?? null);
  if (eventId) await deleteEvent(auth.accessToken, eventId, link?.calendar_id ?? auth.calendarId);
  await clearLink(appointment.organizationId, appointment.id, userId);
  return { status: "removed" };
}

export async function syncAfterAppointmentMutation(appointment: Appointment, userId: number): Promise<GoogleSyncResult> {
  try {
    return await syncAppointmentForUser(appointment, userId);
  } catch (error) {
    if (error instanceof GoogleCalendarConflictError) return { status: "conflict", message: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Fase 2 (SaaS) — Fila de sincronização (`calendar_sync_jobs`)
// ---------------------------------------------------------------------------

/**
 * Chave idempotente por operação de agendamento:
 * appointment:{id}:user:{userId}:version:{version}
 */
export function buildAppointmentSyncIdempotencyKey(
  appointmentId: number,
  userId: number,
  version: string,
): string {
  return `appointment:${appointmentId}:user:${userId}:version:${version}`;
}

/**
 * Enfileira uma operação de sincronização no OllCLin → Google Calendar.
 * A operação é persistida na fila com idempotência; o worker processa assíncrono.
 */
export async function enqueueAppointmentSync(input: {
  organizationId: number;
  appointmentId: number;
  userId: number;
  operation: SyncOperation;
  version: string;
}): Promise<CalendarSyncJob> {
  const job = await googleCalendarSyncModel.insertJob({
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    userId: input.userId,
    operation: input.operation,
    idempotencyKey: buildAppointmentSyncIdempotencyKey(
      input.appointmentId,
      input.userId,
      input.version,
    ),
    payload: {
      appointmentId: input.appointmentId,
      version: input.version,
    },
  });

  if (!job) {
    // Idempotência: job já registrado e concluído — não duplica.
    const existing = await googleCalendarSyncModel.findByIdempotencyKey(
      buildAppointmentSyncIdempotencyKey(input.appointmentId, input.userId, input.version),
    );
    if (!existing) throw new Error("[google_sync] Falha ao enfileirar job de sincronização");
    return existing;
  }
  return job;
}

export async function pullGoogleRangeForUser(input: {
  organizationId: number;
  userId: number;
  from: string;
  to: string;
}): Promise<PullSyncResult> {
  const auth = await googleCalendarModel.getAccessToken(input.organizationId, input.userId);
  if (!auth) return { status: "not_connected", updated: 0, conflicts: [] };
  const events = await listEvents(auth.accessToken, {
    calendarId: auth.calendarId,
    timeMin: new Date(input.from).toISOString(),
    timeMax: new Date(input.to).toISOString(),
    maxResults: 2500,
  });
  let updated = 0;
  const conflicts: string[] = [];
  for (const event of events) {
    const appointmentId = Number(event.extendedProperties?.private?.ollclin_appointment_id);
    const startsAt = event.start.dateTime;
    const endsAt = event.end.dateTime;
    if (!Number.isInteger(appointmentId) || !startsAt || !endsAt) continue;
    const appointment = await appointmentModel.findById(appointmentId, input.organizationId);
    if (!appointment || appointment.status === "desmarcado") continue;
    const nextStart = new Date(startsAt);
    const nextEnd = new Date(endsAt);
    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) continue;
    if (nextStart.toISOString() === new Date(appointment.startsAt).toISOString() && nextEnd.toISOString() === new Date(appointment.endsAt).toISOString()) continue;
    const hasConflict = await appointmentModel.checkConflict({
      professionalId: appointment.professionalId,
      startsAt: nextStart.toISOString(),
      endsAt: nextEnd.toISOString(),
      excludeId: appointment.id,
      roomId: appointment.roomId ?? undefined,
    });
    if (hasConflict) {
      conflicts.push(`Agendamento #${appointment.id}: o novo horário conflita com outro agendamento.`);
      continue;
    }
    await appointmentModel.update(appointment.id, input.organizationId, {
      id: appointment.id,
      startsAt: nextStart.toISOString(),
      endsAt: nextEnd.toISOString(),
    });
    updated += 1;
  }
  return { status: "updated" as const, updated, conflicts };
}
