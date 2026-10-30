/**
 * OllCLin - Camada Model
 * Modelo de dados para Profissionais de Saúde
 * Arquitetura MVC - Acesso ao banco via Supabase (PostgreSQL)
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

export type Professional = {
  id: number;
  organizationId: number;
  userId: number | null;
  fullName: string;
  cpf: string | null;
  council: string | null;
  councilNumber: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

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

type ProfessionalRow = {
  id: number;
  organization_id: number;
  user_id: number | null;
  full_name: string;
  cpf: string | null;
  council: string | null;
  council_number: string | null;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

const PROFESSIONAL_COLUMNS =
  "id, organization_id, user_id, full_name, cpf, council, council_number, specialty, phone, email, is_active, created_at, updated_at";

function toProfessional(row: ProfessionalRow): Professional {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    fullName: row.full_name,
    cpf: row.cpf,
    council: row.council,
    councilNumber: row.council_number,
    specialty: row.specialty,
    phone: row.phone,
    email: row.email,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(data: Partial<CreateProfessionalInput>) {
  const row: Record<string, unknown> = {};
  if (data.organizationId !== undefined) row.organization_id = data.organizationId;
  if (data.userId !== undefined) row.user_id = data.userId ?? null;
  if (data.fullName !== undefined) row.full_name = data.fullName;
  if (data.cpf !== undefined) row.cpf = data.cpf;
  if (data.council !== undefined) row.council = data.council;
  if (data.councilNumber !== undefined) row.council_number = data.councilNumber;
  if (data.specialty !== undefined) row.specialty = data.specialty;
  if (data.phone !== undefined) row.phone = data.phone;
  if (data.email !== undefined) row.email = data.email;
  if (data.isActive !== undefined) row.is_active = data.isActive;
  return row;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(
    `[professionals] ${context}: ${error?.message ?? "erro desconhecido"}`,
  );
}

export const professionalModel = {
  async create(data: CreateProfessionalInput): Promise<Professional> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("professionals")
      .insert({ ...toRow(data), is_active: data.isActive ?? true })
      .select(PROFESSIONAL_COLUMNS)
      .single<ProfessionalRow>();

    if (error || !row) fail("erro ao criar profissional", error);
    return toProfessional(row);
  },

  async findById(
    id: number,
    organizationId: number,
  ): Promise<Professional | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("professionals")
      .select(PROFESSIONAL_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<ProfessionalRow>();

    if (error) fail("erro ao buscar profissional", error);
    return row ? toProfessional(row) : null;
  },

  async findMany(filter: ProfessionalFilter): Promise<Professional[]> {
    const {
      organizationId,
      search,
      specialty,
      isActive,
      limit = 50,
      offset = 0,
    } = filter;

    let query = getSupabaseAdmin()
      .from("professionals")
      .select(PROFESSIONAL_COLUMNS)
      .eq("organization_id", organizationId);

    if (isActive !== undefined) query = query.eq("is_active", isActive);
    if (specialty) query = query.eq("specialty", specialty);

    if (search) {
      const term = search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(
          `full_name.ilike.%${term}%,specialty.ilike.%${term}%,cpf.ilike.%${term}%`,
        );
      }
    }

    const { data, error } = await query
      .order("full_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) fail("erro ao listar profissionais", error);
    return (data ?? []).map((row) => toProfessional(row as ProfessionalRow));
  },

  async update(
    id: number,
    organizationId: number,
    data: UpdateProfessionalInput,
  ): Promise<Professional | null> {
    const { id: _ignored, ...rest } = data;
    const { data: row, error } = await getSupabaseAdmin()
      .from("professionals")
      .update({ ...toRow(rest), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(PROFESSIONAL_COLUMNS)
      .maybeSingle<ProfessionalRow>();

    if (error) fail("erro ao atualizar profissional", error);
    return row ? toProfessional(row) : null;
  },

  async delete(
    id: number,
    organizationId: number,
  ): Promise<Professional | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("professionals")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(PROFESSIONAL_COLUMNS)
      .maybeSingle<ProfessionalRow>();

    if (error) fail("erro ao desativar profissional", error);
    return row ? toProfessional(row) : null;
  },
};
