/**
 * OllCLin - Camada Model
 * Modelo de dados para Profissionais de Saúde
 * Arquitetura MVC - Acesso direto ao banco via Drizzle ORM
 */

import { db } from "../db";
import { professionals, users } from "../../drizzle/schema";
import { eq, ilike, and } from "drizzle-orm";

export type CreateProfessionalInput = {
  organizationId: number;
  userId?: number;
  fullName: string;
  cpf?: string;
  council?: string;
  councilNumber?: string;
  specialty?: string;
  phone?: string;
  email?: string;
  isActive?: boolean;
};

export type UpdateProfessionalInput = Partial<
  Omit<CreateProfessionalInput, "organizationId">
> & { id: number };

export type ProfessionalFilter = {
  organizationId: number;
  search?: string;
  specialty?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

export const professionalModel = {
  async create(data: CreateProfessionalInput) {
    const [professional] = await db
      .insert(professionals)
      .values(data)
      .returning();
    return professional;
  },

  async findById(id: number, organizationId: number) {
    const [professional] = await db
      .select({
        id: professionals.id,
        userId: professionals.userId,
        organizationId: professionals.organizationId,
        fullName: professionals.fullName,
        cpf: professionals.cpf,
        council: professionals.council,
        councilNumber: professionals.councilNumber,
        specialty: professionals.specialty,
        phone: professionals.phone,
        email: professionals.email,
        isActive: professionals.isActive,
        createdAt: professionals.createdAt,
        updatedAt: professionals.updatedAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(professionals)
      .leftJoin(users, eq(professionals.userId, users.id))
      .where(
        and(
          eq(professionals.id, id),
          eq(professionals.organizationId, organizationId),
        ),
      );
    return professional ?? null;
  },

  async findMany(filter: ProfessionalFilter) {
    const { organizationId, search, specialty, isActive, limit = 50, offset = 0 } = filter;

    const conditions = [eq(professionals.organizationId, organizationId)];

    if (isActive !== undefined) {
      conditions.push(eq(professionals.isActive, isActive));
    }

    if (specialty) {
      conditions.push(eq(professionals.specialty, specialty));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(professionals.fullName, searchTerm),
          ilike(professionals.specialty, searchTerm),
        ),
      );
    }

    return await db
      .select({
        id: professionals.id,
        fullName: professionals.fullName,
        cpf: professionals.cpf,
        council: professionals.council,
        councilNumber: professionals.councilNumber,
        specialty: professionals.specialty,
        phone: professionals.phone,
        email: professionals.email,
        isActive: professionals.isActive,
        createdAt: professionals.createdAt,
      })
      .from(professionals)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);
  },

  async update(id: number, organizationId: number, data: UpdateProfessionalInput) {
    const { id: _, ...updateData } = data;
    const [professional] = await db
      .update(professionals)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(
          eq(professionals.id, id),
          eq(professionals.organizationId, organizationId),
        ),
      )
      .returning();
    return professional ?? null;
  },

  async delete(id: number, organizationId: number) {
    const [professional] = await db
      .update(professionals)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(professionals.id, id),
          eq(professionals.organizationId, organizationId),
        ),
      )
      .returning();
    return professional ?? null;
  },
};

// Helper import for 'or' used above
import { or } from "drizzle-orm";