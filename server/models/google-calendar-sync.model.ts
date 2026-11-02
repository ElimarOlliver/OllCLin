/**
 * OllCLin - Modelo da fila de sincronização Google Calendar (Fase 2)
 *
 * Responsabilidades:
 * - persistir jobs de sincronização (`calendar_sync_jobs`);
 * - persistir vínculos agendamento ↔ evento Google (`appointment_google_events`).
 *
 * A tabela `calendar_sync_jobs.idempotency_key` possui constraint UNIQUE, o que
 * garante idempotência: reprocessamentos com a mesma chave são no-ops.
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

export type SyncJobStatus = "pending" | "processing" | "done" | "failed";
export type SyncOperation = "create" | "update" | "delete" | "pull" | "reconcile";

export type CalendarSyncJob = {
  id: number;
  organizationId: number;
  appointmentId: number;
  userId: number;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  attempts: number;
  status: SyncJobStatus;
  nextAttemptAt: string | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AppointmentGoogleEvent = {
  id: number;
  organizationId: number;
  appointmentId: number;
  userId: number;
  calendarId: string;
  eventId: string;
  etag: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
  lastError: string | null;
};

const JOB_COLUMNS =
  "id, organization_id, appointment_id, user_id, operation, payload, idempotency_key, attempts, status, next_attempt_at, last_error, created_at, updated_at";

const EVENT_COLUMNS =
  "id, organization_id, appointment_id, user_id, calendar_id, event_id, etag, last_synced_at, sync_status, last_error, created_at, updated_at";

function toJob(row: Record<string, unknown>): CalendarSyncJob {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    appointmentId: Number(row.appointment_id),
    userId: Number(row.user_id),
    operation: (row.operation as SyncOperation) ?? "update",
    payload: (row.payload as Record<string, unknown>) ?? {},
    idempotencyKey: String(row.idempotency_key ?? ""),
    attempts: Number(row.attempts ?? 0),
    status: (row.status as SyncJobStatus) ?? "pending",
    nextAttemptAt: row.next_attempt_at ? new Date(String(row.next_attempt_at)).toISOString() : null,
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  };
}

function toEvent(row: Record<string, unknown>): AppointmentGoogleEvent {
  return {
    id: Number(row.id),
    organizationId: Number(row.organization_id),
    appointmentId: Number(row.appointment_id),
    userId: Number(row.user_id),
    calendarId: String(row.calendar_id ?? "primary"),
    eventId: String(row.event_id ?? ""),
    etag: row.etag ? String(row.etag) : null,
    lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)).toISOString() : null,
    syncStatus: String(row.sync_status ?? "pending"),
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

export const googleCalendarSyncModel = {
  /** Busca job ativo por chave de idempotência (usado na idempotência). */
  async findByIdempotencyKey(idempotencyKey: string): Promise<CalendarSyncJob | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_sync_jobs")
      .select(JOB_COLUMNS)
      .eq("idempotency_key", idempotencyKey)
      .limit(1)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return toJob(data);
  },

  /** Jobs recentes de uma organização (visão operacional/fila). */
  async findByOrganization(
    organizationId: number,
    limit = 50,
  ): Promise<CalendarSyncJob[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_sync_jobs")
      .select(JOB_COLUMNS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) return [];
    return (data ?? []).map(toJob);
  },

  /** Jobs pendentes e vencidos, na ordem de criação (FIFO). */
  async findDueJobs(limit = 10): Promise<CalendarSyncJob[]> {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_sync_jobs")
      .select(JOB_COLUMNS)
      .eq("status", "pending")
      .lte("next_attempt_at", now)
      .order("created_at", { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error) return [];
    return (data ?? []).map(toJob);
  },

  /** Busca job por id. */
  async findById(id: number): Promise<CalendarSyncJob | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_sync_jobs")
      .select(JOB_COLUMNS)
      .eq("id", id)
      .limit(1)
      .maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return toJob(data);
  },

  /** Histórico de jobs de um agendamento. */
  async findByAppointment(appointmentId: number): Promise<CalendarSyncJob[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_sync_jobs")
      .select(JOB_COLUMNS)
      .eq("appointment_id", appointmentId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map(toJob);
  },

  /** Vínculo agendamento ↔ evento Google (do profissional dono). */
  async findEventByAppointment(input: {
    organizationId: number;
    appointmentId: number;
    userId?: number;
  }): Promise<AppointmentGoogleEvent | null> {
    let query = getSupabaseAdmin()
      .from("appointment_google_events")
      .select(EVENT_COLUMNS)
      .eq("organization_id", input.organizationId)
      .eq("appointment_id", input.appointmentId);
    if (input.userId) query = query.eq("user_id", input.userId);
    const { data, error } = await query.limit(1).maybeSingle<Record<string, unknown>>();
    if (error || !data) return null;
    return toEvent(data);
  },

  /** Grava/atualiza vínculo agendamento ↔ evento. */
  async saveEventLink(input: {
    organizationId: number;
    appointmentId: number;
    userId: number;
    calendarId: string;
    eventId: string;
    syncStatus: string;
    etag?: string | null;
    lastSyncedAt?: string | null;
    lastError?: string | null;
  }): Promise<AppointmentGoogleEvent> {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("appointment_google_events")
      .upsert(
        {
          organization_id: input.organizationId,
          appointment_id: input.appointmentId,
          user_id: input.userId,
          calendar_id: input.calendarId,
          event_id: input.eventId,
          etag: input.etag ?? null,
          last_synced_at: input.lastSyncedAt ?? now,
          sync_status: input.syncStatus,
          last_error: input.lastError ?? null,
        },
        { onConflict: "appointment_id,user_id" },
      )
      .select(EVENT_COLUMNS)
      .single<Record<string, unknown>>();
    if (error || !data) {
      throw new Error(
        `[google_sync] Falha ao salvar vínculo: ${error?.message ?? "erro"}`,
      );
    }
    return toEvent(data);
  },

  /** Insere job idempotente (unique em idempotency_key). Retorna job existente se já existir. */
  async insertJob(input: {
    organizationId: number;
    appointmentId: number;
    userId: number;
    operation: SyncOperation;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<CalendarSyncJob | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("calendar_sync_jobs")
      .insert(input)
      .select(JOB_COLUMNS)
      .single<Record<string, unknown>>();
    if (error) {
      // Unique violation em idempotency_key ⇒ job já registrado (idempotência).
      const existing = await this.findByIdempotencyKey(input.idempotencyKey);
      return existing;
    }
    return toJob(data);
  },

  /** Busca job por id e devolve a versão atualizada (para claim/atualizações). */
  async updateJobStatus(
    id: number,
    status: SyncJobStatus,
    overrides: {
      attempts?: number;
      nextAttemptAt?: string | null;
      lastError?: string | null;
    } = {},
  ): Promise<CalendarSyncJob | null> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status };
    if (overrides.attempts !== undefined) patch.attempts = overrides.attempts;
    if (overrides.nextAttemptAt !== undefined) patch.next_attempt_at = overrides.nextAttemptAt;
    if (overrides.lastError !== undefined) patch.last_error = overrides.lastError;
    patch.updated_at = now;

    const { data, error } = await getSupabaseAdmin()
      .from("calendar_sync_jobs")
      .update(patch)
      .eq("id", id)
      .select(JOB_COLUMNS)
      .single<Record<string, unknown>>();
    if (error || !data) return null;
    return toJob(data);
  },
};

