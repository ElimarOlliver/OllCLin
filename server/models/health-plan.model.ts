/**
 * OllCLin - Camada Model
 * Modelo de dados para Convênios (health_plans)
 * Arquitetura MVC - Acesso ao banco via Supabase (PostgreSQL)
 *
 * Requisitos de origem (briefing Cap. 05 — Convênios):
 * - REQ-05-001: entrada Configurações Gerais > Convênios + "Adicionar novo convênio"
 * - REQ-05-002: operadora de lista predefinida ou cadastrada manualmente
 * - REQ-05-003: código ANS e versão XML TISS (confirmar com a operadora)
 * - REQ-05-004: salvar, editar e excluir na lista de convênios
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

export type HealthPlan = {
  id: number;
  organizationId: number;
  operatorName: string;
  ansCode: string | null;
  tissXmlVersion: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateHealthPlanInput = {
  organizationId: number;
  operatorName: string;
  ansCode?: string;
  tissXmlVersion?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  isActive?: boolean;
};

export type UpdateHealthPlanInput = Partial<
  Omit<CreateHealthPlanInput, "organizationId">
> & { id: number };

export type HealthPlanFilter = {
  organizationId: number;
  search?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
};

type HealthPlanRow = {
  id: number;
  organization_id: number;
  operator_name: string;
  ans_code: string | null;
  tiss_xml_version: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

const HEALTH_PLAN_COLUMNS =
  "id, organization_id, operator_name, ans_code, tiss_xml_version, contact_email, contact_phone, notes, is_active, created_at, updated_at";

function toHealthPlan(row: HealthPlanRow): HealthPlan {
  return {
    id: row.id,
    organizationId: row.organization_id,
    operatorName: row.operator_name,
    ansCode: row.ans_code,
    tissXmlVersion: row.tiss_xml_version,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    notes: row.notes,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fail(context: string, error: { message: string } | null): never {
  console.error(`[HealthPlanModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} convênio`);
}

export const healthPlanModel = {
  async create(data: CreateHealthPlanInput): Promise<HealthPlan> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("health_plans")
      .insert({
        organization_id: data.organizationId,
        operator_name: data.operatorName,
        ans_code: data.ansCode ?? null,
        tiss_xml_version: data.tissXmlVersion ?? null,
        contact_email: data.contactEmail ?? null,
        contact_phone: data.contactPhone ?? null,
        notes: data.notes ?? null,
        is_active: data.isActive ?? true,
      })
      .select(HEALTH_PLAN_COLUMNS)
      .single();
    if (error) fail("criar", error);
    return toHealthPlan(row);
  },

  async findById(id: number, organizationId: number): Promise<HealthPlan | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("health_plans")
      .select(HEALTH_PLAN_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) fail("consultar", error);
    return row ? toHealthPlan(row) : null;
  },

  async findMany(filter: HealthPlanFilter): Promise<HealthPlan[]> {
    let query = getSupabaseAdmin()
      .from("health_plans")
      .select(HEALTH_PLAN_COLUMNS)
      .eq("organization_id", filter.organizationId)
      .order("operator_name", { ascending: true });

    if (filter.isActive !== undefined) query = query.eq("is_active", filter.isActive);
    if (filter.search) {
      query = query.ilike("operator_name", `%${filter.search}%`);
    }

    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 50) - 1,
    );
    if (error) fail("listar", error);
    return (data ?? []).map(toHealthPlan);
  },

  async update(id: number, organizationId: number, data: UpdateHealthPlanInput): Promise<HealthPlan | null> {
    const patch: Record<string, unknown> = {};
    if (data.operatorName !== undefined) patch.operator_name = data.operatorName;
    if (data.ansCode !== undefined) patch.ans_code = data.ansCode;
    if (data.tissXmlVersion !== undefined) patch.tiss_xml_version = data.tissXmlVersion;
    if (data.contactEmail !== undefined) patch.contact_email = data.contactEmail;
    if (data.contactPhone !== undefined) patch.contact_phone = data.contactPhone;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.isActive !== undefined) patch.is_active = data.isActive;

    if (Object.keys(patch).length === 0) return this.findById(id, organizationId);

    const { data: row, error } = await getSupabaseAdmin()
      .from("health_plans")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(HEALTH_PLAN_COLUMNS)
      .maybeSingle();
    if (error) fail("atualizar", error);
    return row ? toHealthPlan(row) : null;
  },

  /** Soft delete (REQ-05-004): mantém histórico e integridade referencial. */
  async softDelete(id: number, organizationId: number): Promise<HealthPlan | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("health_plans")
      .update({ is_active: false })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(HEALTH_PLAN_COLUMNS)
      .maybeSingle();
    if (error) fail("inativar", error);
    return row ? toHealthPlan(row) : null;
  },
};
