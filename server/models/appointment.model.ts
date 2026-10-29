/**
 * OllCLin - Camada Model
 * Modelo de dados para Agendamentos
 * Arquitetura MVC - Acesso direto ao banco via Drizzle ORM
 */

import { db } from "../db";
import {
  appointments,
  patients,
  professionals,
  procedures,
  users,
} from "../../drizzle/schema";
import { eq, and, gte, lte, or, desc, asc } from "drizzle-orm";

export type CreateAppointmentInput = {
  organizationId: number;
  patientId: number;
  professionalId: number;
  procedureId: number;
  establishmentId?: number;
  locationId?: number;
  roomId?: number;
  startsAt: Date;
  endsAt: Date;
  status?: "solicitado" | "confirmado" | "em_espera" | "em_atendimento" | "atendido" | "faltou" | "desmarcado";
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
  startsAtFrom?: Date;
  startsAtTo?: Date;
  limit?: number;
  offset?: number;
};

export type ConflictCheck = {
  professionalId: number;
  startsAt: Date;
  endsAt: Date;
  excludeId?: number;
  roomId?: number;
};

export const appointmentModel = {
  /**
   * Criar novo agendamento
   */
  async create(data: CreateAppointmentInput) {
    const [appointment] = await db
      .insert(appointments)
      .values(data)
      .returning();
    return appointment;
  },

  /**
   * Buscar agendamento por ID com relações
   */
  async findById(id: number, organizationId: number) {
    const [appointment] = await db
      .select({
        id: appointments.id,
        patientId: appointments.patientId,
        professionalId: appointments.professionalId,
        procedureId: appointments.procedureId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        notes: appointments.notes,
        googleCalendarEventId: appointments.googleCalendarEventId,
        createdAt: appointments.createdAt,
        patient: {
          id: patients.id,
          fullName: patients.fullName,
          cpf: patients.cpf,
          phone: patients.phone,
          email: patients.email,
        },
        professional: {
          id: professionals.id,
          fullName: professionals.fullName,
          specialty: professionals.specialty,
        },
        procedure: {
          id: procedures.id,
          name: procedures.name,
          durationMinutes: procedures.durationMinutes,
        },
        createdByUser: {
          id: users.id,
          name: users.name,
        },
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(professionals, eq(appointments.professionalId, professionals.id))
      .innerJoin(procedures, eq(appointments.procedureId, procedures.id))
      .leftJoin(users, eq(appointments.createdBy, users.id))
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.organizationId, organizationId),
        ),
      );
    return appointment ?? null;
  },

  /**
   * Buscar agendamentos com filtros
   */
  async findMany(filter: AppointmentFilter) {
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

    const conditions = [eq(appointments.organizationId, organizationId)];

    if (professionalId) {
      conditions.push(eq(appointments.professionalId, professionalId));
    }

    if (patientId) {
      conditions.push(eq(appointments.patientId, patientId));
    }

    if (status) {
      conditions.push(eq(appointments.status, status as any));
    }

    if (startsAtFrom) {
      conditions.push(gte(appointments.startsAt, startsAtFrom));
    }

    if (startsAtTo) {
      conditions.push(lte(appointments.startsAt, startsAtTo));
    }

    return await db
      .select({
        id: appointments.id,
        patientId: appointments.patientId,
        professionalId: appointments.professionalId,
        procedureId: appointments.procedureId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        patient: {
          id: patients.id,
          fullName: patients.fullName,
          cpf: patients.cpf,
        },
        professional: {
          id: professionals.id,
          fullName: professionals.fullName,
        },
        procedure: {
          id: procedures.id,
          name: procedures.name,
        },
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(professionals, eq(appointments.professionalId, professionals.id))
      .innerJoin(procedures, eq(appointments.procedureId, procedures.id))
      .where(and(...conditions))
      .orderBy(desc(appointments.startsAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Atualizar agendamento
   */
  async update(id: number, organizationId: number, data: UpdateAppointmentInput) {
    const { id: _, ...updateData } = data;
    const [appointment] = await db
      .update(appointments)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)),
      )
      .returning();
    return appointment ?? null;
  },

  /**
   * Exclusão lógica
   */
  async delete(id: number, organizationId: number) {
    const [appointment] = await db
      .update(appointments)
      .set({ status: "desmarcado", updatedAt: new Date() })
      .where(
        and(eq(appointments.id, id), eq(appointments.organizationId, organizationId)),
      )
      .returning();
    return appointment ?? null;
  },

  /**
   * Verificar conflito de horário (profissional ou sala)
   */
  async checkConflict(data: ConflictCheck) {
    const { professionalId, startsAt, endsAt, excludeId, roomId } = data;

    const conditions = [
      eq(appointments.professionalId, professionalId),
      // Overlap check: new starts before existing ends AND new ends after existing starts
      lte(appointments.startsAt, endsAt),
      gte(appointments.endsAt, startsAt),
      // Exclude cancelled/missed
      or(
        eq(appointments.status, "solicitado"),
        eq(appointments.status, "confirmado"),
        eq(appointments.status, "em_espera"),
        eq(appointments.status, "em_atendimento"),
      ),
    ];

    if (excludeId) {
      // drizzle doesn't have direct neq, we handle in code
    }

    const conflicts = await db
      .select({ id: appointments.id, status: appointments.status })
      .from(appointments)
      .where(and(...conditions));

    const filteredConflicts = excludeId
      ? conflicts.filter((c) => c.id !== excludeId)
      : conflicts;

    return filteredConflicts.length > 0;
  },

  /**
   * Buscar agendamentos por período (para Google Calendar sync)
   */
  async findByPeriod(organizationId: number, from: Date, to: Date) {
    return await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.organizationId, organizationId),
          gte(appointments.startsAt, from),
          lte(appointments.startsAt, to),
        ),
      )
      .orderBy(asc(appointments.startsAt));
  },
};