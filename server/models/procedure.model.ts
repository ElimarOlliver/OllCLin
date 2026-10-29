/**
 * OllCLin - Camada Model
 * Modelo de dados para Procedimentos
 * Arquitetura MVC - Acesso direto ao banco via Drizzle ORM
 */

import { db } from "../db";
import { procedures } from "../../drizzle/schema";
import { eq, ilike, and } from "drizzle-orm";

export type CreateProcedureInput = {
  organizationId: number;
  name: string;
  description?: string;
  durationMinutes?: number;
  price?: string;
  isActive?: boolean;
};

export type UpdateProcedureInput = Partial<
  Omit<CreateProcedureInput, "organizationId">
> & { id: number };

export type ProcedureFilter = {
  organizationId: number;
  search?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

export const procedureModel = {
  async create(data: CreateProcedureInput) {
    const [procedure] = await db
      .insert(procedures)
      .values(data)
      .returning();
    return procedure;
  },

  async findById(id: number, organizationId: number) {
    const [procedure] = await db
      .select()
      .from(procedures)
      .where(
        and(
          eq(procedures.id, id),
          eq(procedures.organizationId, organizationId),
        ),
      );
    return procedure ?? null;
  },

  async findMany(filter: ProcedureFilter) {
    const { organizationId, search, isActive, limit = 50, offset = 0 } = filter;

    const conditions = [eq(procedures.organizationId, organizationId)];

    if (isActive !== undefined) {
      conditions.push(eq(procedures.isActive, isActive));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(procedures.name, searchTerm),
          ilike(procedures.description, searchTerm),
        ),
      );
    }

    return await db
      .select()
      .from(procedures)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);
  },

  async update(id: number, organizationId: number, data: UpdateProcedureInput) {
    const { id: _, ...updateData } = data;
    const [procedure] = await db
      .update(procedures)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(
          eq(procedures.id, id),
          eq(procedures.organizationId, organizationId),
        ),
      )
      .returning();
    return procedure ?? null;
  },

  async delete(id: number, organizationId: number) {
    const [procedure] = await db
      .update(procedures)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(procedures.id, id),
          eq(procedures.organizationId, organizationId),
        ),
      )
      .returning();
    return procedure ?? null;
  },
};

// Helper import for 'or' used above
import { or } from "drizzle-orm";