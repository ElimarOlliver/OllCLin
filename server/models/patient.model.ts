/**
 * OllCLin - Camada Model
 * Modelo de dados para Pacientes
 * Arquitetura MVC - Acesso ao banco via Supabase (PostgreSQL)
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

export type Patient = {
  id: number;
  organizationId: number;
  fullName: string;
  socialName: string | null;
  cpf: string | null;
  rg: string | null;
  birthDate: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  consentDataSharing: boolean;
  consentMarketing: boolean;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreatePatientInput = {
  organizationId: number;
  fullName: string;
  socialName?: string;
  cpf?: string;
  rg?: string;
  birthDate?: string;
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

type PatientRow = {
  id: number;
  organization_id: number;
  full_name: string;
  social_name: string | null;
  cpf: string | null;
  rg: string | null;
  birth_date: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  consent_data_sharing: boolean | null;
  consent_marketing: boolean | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

const PATIENT_COLUMNS =
  "id, organization_id, full_name, social_name, cpf, rg, birth_date, gender, phone, email, address, city, state, zip_code, emergency_contact, emergency_phone, consent_data_sharing, consent_marketing, is_active, created_at, updated_at";

function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    socialName: row.social_name,
    cpf: row.cpf,
    rg: row.rg,
    birthDate: row.birth_date,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    emergencyContact: row.emergency_contact,
    emergencyPhone: row.emergency_phone,
    consentDataSharing: row.consent_data_sharing ?? false,
    consentMarketing: row.consent_marketing ?? false,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(data: Partial<CreatePatientInput>) {
  const row: Record<string, unknown> = {};
  if (data.organizationId !== undefined) row.organization_id = data.organizationId;
  if (data.fullName !== undefined) row.full_name = data.fullName;
  if (data.socialName !== undefined) row.social_name = data.socialName;
  if (data.cpf !== undefined) row.cpf = data.cpf;
  if (data.rg !== undefined) row.rg = data.rg;
  if (data.birthDate !== undefined) row.birth_date = data.birthDate || null;
  if (data.gender !== undefined) row.gender = data.gender;
  if (data.phone !== undefined) row.phone = data.phone;
  if (data.email !== undefined) row.email = data.email;
  if (data.address !== undefined) row.address = data.address;
  if (data.city !== undefined) row.city = data.city;
  if (data.state !== undefined) row.state = data.state;
  if (data.zipCode !== undefined) row.zip_code = data.zipCode;
  if (data.emergencyContact !== undefined)
    row.emergency_contact = data.emergencyContact;
  if (data.emergencyPhone !== undefined)
    row.emergency_phone = data.emergencyPhone;
  if (data.consentDataSharing !== undefined)
    row.consent_data_sharing = data.consentDataSharing;
  if (data.consentMarketing !== undefined)
    row.consent_marketing = data.consentMarketing;
  return row;
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[patients] ${context}: ${error?.message ?? "erro desconhecido"}`);
}

export const patientModel = {
  async create(data: CreatePatientInput): Promise<Patient> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("patients")
      .insert({ ...toRow(data), is_active: true })
      .select(PATIENT_COLUMNS)
      .single<PatientRow>();

    if (error || !row) fail("erro ao criar paciente", error);
    return toPatient(row);
  },

  async findById(id: number, organizationId: number): Promise<Patient | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("patients")
      .select(PATIENT_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<PatientRow>();

    if (error) fail("erro ao buscar paciente", error);
    return row ? toPatient(row) : null;
  },

  async findMany(filter: PatientFilter): Promise<Patient[]> {
    const {
      organizationId,
      search,
      cpf,
      isActive,
      limit = 50,
      offset = 0,
    } = filter;

    let query = getSupabaseAdmin()
      .from("patients")
      .select(PATIENT_COLUMNS)
      .eq("organization_id", organizationId);

    if (isActive !== undefined) query = query.eq("is_active", isActive);
    if (cpf) query = query.eq("cpf", cpf);

    if (search) {
      const term = search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(
          `full_name.ilike.%${term}%,cpf.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
        );
      }
    }

    const { data, error } = await query
      .order("full_name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) fail("erro ao listar pacientes", error);
    return (data ?? []).map((row) => toPatient(row as PatientRow));
  },

  async update(
    id: number,
    organizationId: number,
    data: UpdatePatientInput,
  ): Promise<Patient | null> {
    const { id: _ignored, ...rest } = data;
    const { data: row, error } = await getSupabaseAdmin()
      .from("patients")
      .update({ ...toRow(rest), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(PATIENT_COLUMNS)
      .maybeSingle<PatientRow>();

    if (error) fail("erro ao atualizar paciente", error);
    return row ? toPatient(row) : null;
  },

  /** Exclusão lógica (LGPD: preserva histórico, evita perda de dados) */
  async delete(id: number, organizationId: number): Promise<Patient | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("patients")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(PATIENT_COLUMNS)
      .maybeSingle<PatientRow>();

    if (error) fail("erro ao desativar paciente", error);
    return row ? toPatient(row) : null;
  },

  async existsByCpf(
    cpf: string,
    organizationId: number,
    excludeId?: number,
  ): Promise<boolean> {
    let query = getSupabaseAdmin()
      .from("patients")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("cpf", cpf);

    if (excludeId) query = query.neq("id", excludeId);

    const { data, error } = await query.limit(1);
    if (error) fail("erro ao verificar CPF", error);
    return (data ?? []).length > 0;
  },
};
