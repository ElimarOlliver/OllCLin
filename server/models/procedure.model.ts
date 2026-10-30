/**
 * OllCLin - Camada Model
 * Modelo de dados para Procedimentos
 * Arquitetura MVC - Acesso ao banco via Supabase (PostgreSQL)
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

export type Procedure = {
  id: number;
  organizationId: number;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  price: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

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

type ProcedureRow = {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  price: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

const PROCEDURE_COLUMNS =
  "id, organization_id, name, description, duration_minutes, price, is_active, created_at, updated_at";

function toProcedure(row: ProcedureRow): Procedure {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    price: row.price,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(data: Partial<CreateProcedureInput>) {
  const row: Record<string, unknown> = {};
  if (data.organizationId !== undefined) row.organization_id = data.organizationId;
  if (data.name !== undefined) row.name = data.name;
  if (data.description !== undefined) row.description = data.description;
  if (data.durationMinutes !== undefined) row.duration_minutes = data.durationMinutes;
  if (data.price !== undefined) row.price = data.price;
  if (data.isActive !== undefined) row.is_active = data.isActive;
  return row;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(
    `[procedures] ${context}: ${error?.message ?? "erro desconhecido"}`,
  );
}

export const procedureModel = {
  async create(data: CreateProcedureInput): Promise<Procedure> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("procedures")
      .insert({ ...toRow(data), is_active: data.isActive ?? true })
      .select(PROCEDURE_COLUMNS)
      .single<ProcedureRow>();

    if (error || !row) fail("erro ao criar procedimento", error);
    return toProcedure(row);
  },

  async findById(
    id: number,
    organizationId: number,
  ): Promise<Procedure | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("procedures")
      .select(PROCEDURE_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<ProcedureRow>();

    if (error) fail("erro ao buscar procedimento", error);
    return row ? toProcedure(row) : null;
  },

  async findMany(filter: ProcedureFilter): Promise<Procedure[]> {
    const { organizationId, search, isActive, limit = 50, offset = 0 } = filter;

    let query = getSupabaseAdmin()
      .from("procedures")
      .select(PROCEDURE_COLUMNS)
      .eq("organization_id", organizationId);

    if (isActive !== undefined) query = query.eq("is_active", isActive);

    if (search) {
      const term = search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
      }
    }

    const { data, error } = await query
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) fail("erro ao listar procedimentos", error);
    return (data ?? []).map((row) => toProcedure(row as ProcedureRow));
  },

  async update(
    id: number,
    organizationId: number,
    data: UpdateProcedureInput,
  ): Promise<Procedure | null> {
    const { id: _ignored, ...rest } = data;
    const { data: row, error } = await getSupabaseAdmin()
      .from("procedures")
      .update({ ...toRow(rest), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(PROCEDURE_COLUMNS)
      .maybeSingle<ProcedureRow>();

    if (error) fail("erro ao atualizar procedimento", error);
    return row ? toProcedure(row) : null;
  },

  async delete(
    id: number,
    organizationId: number,
  ): Promise<Procedure | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("procedures")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(PROCEDURE_COLUMNS)
      .maybeSingle<ProcedureRow>();

    if (error) fail("erro ao desativar procedimento", error);
    return row ? toProcedure(row) : null;
  },
};
