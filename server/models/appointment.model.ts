/**
 * OllCLin - Camada Model
 * Modelo de dados para Agendamentos
 * Arquitetura MVC - Acesso ao banco via Supabase (PostgreSQL)
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import { toDbTimestamp } from "../lib/datetime";

export type AppointmentStatus =
  | "solicitado"
  | "confirmado"
  | "em_espera"
  | "em_atendimento"
  | "atendido"
  | "faltou"
  | "desmarcado";

export type Appointment = {
  id: number;
  organizationId: number;
  patientId: number;
  professionalId: number;
  procedureId: number;
  establishmentId: number | null;
  locationId: number | null;
  roomId: number | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  googleCalendarEventId: string | null;
  notes: string | null;
  createdAt: string | null;
  patient?: {
    id: number;
    fullName: string;
    cpf: string | null;
    phone: string | null;
    email?: string | null;
  };
  professional?: {
    id: number;
    fullName: string;
    specialty?: string | null;
  };
  procedure?: {
    id: number;
    name: string;
    durationMinutes?: number | null;
  };
};

export type CreateAppointmentInput = {
  organizationId: number;
  patientId: number;
  professionalId: number;
  procedureId: number;
  establishmentId?: number;
  locationId?: number;
  roomId?: number;
  startsAt: string;
  endsAt: string;
  status?: AppointmentStatus;
  notes?: string;
  createdBy?: number;
};

export type UpdateAppointmentInput = Partial<
  Omit<CreateAppointmentInput, "organizationId">
> & { id: number };

export type AppointmentFilter = {
  organizationId: number;
  professionalId?: number;
  patientId?: number;
  status?: string;
  startsAtFrom?: string;
  startsAtTo?: string;
  limit?: number;
  offset?: number;
};

export type ConflictCheck = {
  professionalId: number;
  startsAt: string;
  endsAt: string;
  excludeId?: number;
  roomId?: number;
};

type AppointmentRow = {
  id: number;
  organization_id: number;
  patient_id: number;
  professional_id: number;
  procedure_id: number;
  establishment_id: number | null;
  location_id: number | null;
  room_id: number | null;
  starts_at: string;
  ends_at: string;
  status: string | null;
  google_calendar_event_id: string | null;
  notes: string | null;
  created_at: string | null;
};

const APPOINTMENT_COLUMNS =
  "id, organization_id, patient_id, professional_id, procedure_id, establishment_id, location_id, room_id, starts_at, ends_at, status, google_calendar_event_id, notes, created_at";

const CONFLICT_STATUSES: AppointmentStatus[] = [
  "solicitado",
  "confirmado",
  "em_espera",
  "em_atendimento",
];

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    procedureId: row.procedure_id,
    establishmentId: row.establishment_id,
    locationId: row.location_id,
    roomId: row.room_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: (row.status as AppointmentStatus) ?? "solicitado",
    googleCalendarEventId: row.google_calendar_event_id,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function toRow(data: Partial<CreateAppointmentInput>) {
  const row: Record<string, unknown> = {};
  if (data.organizationId !== undefined) row.organization_id = data.organizationId;
  if (data.patientId !== undefined) row.patient_id = data.patientId;
  if (data.professionalId !== undefined) row.professional_id = data.professionalId;
  if (data.procedureId !== undefined) row.procedure_id = data.procedureId;
  if (data.establishmentId !== undefined)
    row.establishment_id = data.establishmentId ?? null;
  if (data.locationId !== undefined) row.location_id = data.locationId ?? null;
  if (data.roomId !== undefined) row.room_id = data.roomId ?? null;
  if (data.startsAt !== undefined) row.starts_at = toDbTimestamp(data.startsAt);
  if (data.endsAt !== undefined) row.ends_at = toDbTimestamp(data.endsAt);
  if (data.status !== undefined) row.status = data.status;
  if (data.notes !== undefined) row.notes = data.notes;
  if (data.createdBy !== undefined) row.created_by = data.createdBy;
  return row;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(
    `[appointments] ${context}: ${error?.message ?? "erro desconhecido"}`,
  );
}

/** Anexa paciente, profissional e procedimento aos agendamentos. */
async function hydrate(rows: AppointmentRow[]): Promise<Appointment[]> {
  if (rows.length === 0) return [];
  const appointments = rows.map(toAppointment);
  const supabase = getSupabaseAdmin();

  const patientIds = [...new Set(rows.map((r) => r.patient_id))];
  const professionalIds = [...new Set(rows.map((r) => r.professional_id))];
  const procedureIds = [...new Set(rows.map((r) => r.procedure_id))];

  const [patientsResult, professionalsResult, proceduresResult] =
    await Promise.all([
      supabase
        .from("patients")
        .select("id, full_name, cpf, phone, email")
        .in("id", patientIds),
      supabase
        .from("professionals")
        .select("id, full_name, specialty")
        .in("id", professionalIds),
      supabase
        .from("procedures")
        .select("id, name, duration_minutes")
        .in("id", procedureIds),
    ]);

  const patients = new Map(
    (patientsResult.data ?? []).map((p) => [
      p.id as number,
      {
        id: p.id as number,
        fullName: p.full_name as string,
        cpf: p.cpf as string | null,
        phone: p.phone as string | null,
        email: p.email as string | null,
      },
    ]),
  );
  const professionals = new Map(
    (professionalsResult.data ?? []).map((p) => [
      p.id as number,
      {
        id: p.id as number,
        fullName: p.full_name as string,
        specialty: p.specialty as string | null,
      },
    ]),
  );
  const procedures = new Map(
    (proceduresResult.data ?? []).map((p) => [
      p.id as number,
      {
        id: p.id as number,
        name: p.name as string,
        durationMinutes: p.duration_minutes as number | null,
      },
    ]),
  );

  return appointments.map((appointment) => ({
    ...appointment,
    patient: patients.get(appointment.patientId),
    professional: professionals.get(appointment.professionalId),
    procedure: procedures.get(appointment.procedureId),
  }));
}

export const appointmentModel = {
  async create(data: CreateAppointmentInput): Promise<Appointment> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("appointments")
      .insert(toRow(data))
      .select(APPOINTMENT_COLUMNS)
      .single<AppointmentRow>();

    if (error || !row) fail("erro ao criar agendamento", error);
    const [appointment] = await hydrate([row]);
    return appointment;
  },

  async findById(
    id: number,
    organizationId: number,
  ): Promise<Appointment | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<AppointmentRow>();

    if (error) fail("erro ao buscar agendamento", error);
    if (!row) return null;
    const [appointment] = await hydrate([row]);
    return appointment;
  },

  async findMany(filter: AppointmentFilter): Promise<Appointment[]> {
    const {
      organizationId,
      professionalId,
      patientId,
      status,
      startsAtFrom,
      startsAtTo,
      limit = 50,
      offset = 0,
    } = filter;

    let query = getSupabaseAdmin()
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("organization_id", organizationId);

    if (professionalId) query = query.eq("professional_id", professionalId);
    if (patientId) query = query.eq("patient_id", patientId);
    if (status) query = query.eq("status", status);
    if (startsAtFrom) query = query.gte("starts_at", toDbTimestamp(startsAtFrom));
    if (startsAtTo) query = query.lte("starts_at", toDbTimestamp(startsAtTo));

    const { data, error } = await query
      .order("starts_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) fail("erro ao listar agendamentos", error);
    return hydrate((data ?? []) as AppointmentRow[]);
  },

  async update(
    id: number,
    organizationId: number,
    data: UpdateAppointmentInput,
  ): Promise<Appointment | null> {
    const { id: _ignored, ...rest } = data;
    const { data: row, error } = await getSupabaseAdmin()
      .from("appointments")
      .update({ ...toRow(rest), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(APPOINTMENT_COLUMNS)
      .maybeSingle<AppointmentRow>();

    if (error) fail("erro ao atualizar agendamento", error);
    if (!row) return null;
    const [appointment] = await hydrate([row]);
    return appointment;
  },

  /** Cancelamento (mantém histórico para auditoria/LGPD) */
  async delete(
    id: number,
    organizationId: number,
  ): Promise<Appointment | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("appointments")
      .update({ status: "desmarcado", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(APPOINTMENT_COLUMNS)
      .maybeSingle<AppointmentRow>();

    if (error) fail("erro ao cancelar agendamento", error);
    if (!row) return null;
    const [appointment] = await hydrate([row]);
    return appointment;
  },

  /** Verifica sobreposição de horário para o profissional (e sala, se informada). */
  async checkConflict(data: ConflictCheck): Promise<boolean> {
    const supabase = getSupabaseAdmin();

    const buildQuery = (column: "professional_id" | "room_id", value: number) => {
      let query = supabase
        .from("appointments")
        .select("id")
        .eq(column, value)
        .in("status", CONFLICT_STATUSES)
        .lt("starts_at", toDbTimestamp(data.endsAt))
        .gt("ends_at", toDbTimestamp(data.startsAt));

      if (data.excludeId) query = query.neq("id", data.excludeId);
      return query.limit(1);
    };

    const { data: conflicts, error } = await buildQuery(
      "professional_id",
      data.professionalId,
    );
    if (error) fail("erro ao verificar conflito", error);
    if ((conflicts ?? []).length > 0) return true;

    if (data.roomId) {
      const { data: roomConflicts, error: roomError } = await buildQuery(
        "room_id",
        data.roomId,
      );
      if (roomError) fail("erro ao verificar conflito de sala", roomError);
      if ((roomConflicts ?? []).length > 0) return true;
    }

    return false;
  },

  /** Agendamentos por período (usado na sincronização com o Google Calendar). */
  async findByPeriod(
    organizationId: number,
    from: string,
    to: string,
  ): Promise<Appointment[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("organization_id", organizationId)
      .gte("starts_at", toDbTimestamp(from))
      .lte("starts_at", toDbTimestamp(to))
      .order("starts_at", { ascending: true });

    if (error) fail("erro ao listar agendamentos do período", error);
    return hydrate((data ?? []) as AppointmentRow[]);
  },
};
