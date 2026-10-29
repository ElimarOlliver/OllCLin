/**
 * OllCLin - Camada Model
 * Modelo de dados para Pacientes
 * Arquitetura MVC - Acesso direto ao banco via Drizzle ORM
 */

import { db } from "../db";
import { patients, organizations } from "../../drizzle/schema";
import { eq, ilike, or, and } from "drizzle-orm";

export type CreatePatientInput = {
  organizationId: number;
  fullName: string;
  socialName?: string;
  cpf?: string;
  rg?: string;
  birthDate?: Date;
  gender?: "M" | "F" | "O";
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  consentDataSharing?: boolean;
  consentMarketing?: boolean;
};

export type UpdatePatientInput = Partial<
  Omit<CreatePatientInput, "organizationId">
> & { id: number };

export type PatientFilter = {
  organizationId: number;
  search?: string;
  cpf?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

export const patientModel = {
  /**
   * Criar novo paciente
   */
  async create(data: CreatePatientInput) {
    const [patient] = await db
      .insert(patients)
      .values(data)
      .returning();
    return patient;
  },

  /**
   * Buscar paciente por ID
   */
  async findById(id: number, organizationId: number) {
    const [patient] = await db
      .select()
      .from(patients)
      .where(
        and(eq(patients.id, id), eq(patients.organizationId, organizationId)),
      );
    return patient ?? null;
  },

  /**
   * Buscar pacientes com filtros
   */
  async findMany(filter: PatientFilter) {
    const { organizationId, search, cpf, isActive, limit = 50, offset = 0 } =
      filter;

    const conditions = [eq(patients.organizationId, organizationId)];

    if (isActive !== undefined) {
      conditions.push(eq(patients.isActive, isActive));
    }

    if (cpf) {
      conditions.push(eq(patients.cpf, cpf));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(patients.fullName, searchTerm),
          ilike(patients.cpf, searchTerm),
          ilike(patients.email, searchTerm),
        ),
      );
    }

    return await db
      .select()
      .from(patients)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Atualizar paciente
   */
  async update(id: number, organizationId: number, data: UpdatePatientInput) {
    const { id: _, ...updateData } = data;
    const [patient] = await db
      .update(patients)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(eq(patients.id, id), eq(patients.organizationId, organizationId)),
      )
      .returning();
    return patient ?? null;
  },

  /**
   * Exclusão lógica (soft delete)
   */
  async delete(id: number, organizationId: number) {
    const [patient] = await db
      .update(patients)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(eq(patients.id, id), eq(patients.organizationId, organizationId)),
      )
      .returning();
    return patient ?? null;
  },

  /**
   * Verificar se CPF já existe na organização
   */
  async existsByCpf(cpf: string, organizationId: number, excludeId?: number) {
    const conditions = [
      eq(patients.cpf, cpf),
      eq(patients.organizationId, organizationId),
    ];

    if (excludeId) {
      conditions.push(eq(patients.id, excludeId));
      // Not equal - drizzle doesn't have neq directly, use sql
      const { sql } = await import("drizzle-orm/sql");
      // Simplified: just fetch and filter
    }

    const result = await db
      .select({ id: patients.id })
      .from(patients)
      .where(and(...conditions));

    if (excludeId) {
      return result.some((r) => r.id !== excludeId);
    }

    return result.length > 0;
  },
};