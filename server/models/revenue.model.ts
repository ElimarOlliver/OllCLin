/**
 * OllCLin - Camada Model
 * Modelo de dados para Receitas / Recebimentos (revenues)
 * Arquitetura MVC - Acesso ao banco via Supabase (PostgreSQL)
 *
 * Requisitos de origem (briefing Cap. 15 — Financeiro):
 * - Múltiplas linhas por lançamento (parcelas)
 * - Pagador diferente do paciente (payer_name)
 * - Status automáticos: desconto / cortesia conforme forma de pagamento
 * - Cancelamento apenas com status "a_receber" + motivo no histórico
 * - Resumo: recebidos e a receber (REQ-15.1)
 * - Intervalo de pesquisa limitado a 90 dias
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import {
  MIGRATION_0003_FIELDS_HINT,
  getSchemaCapabilities,
} from "../lib/schema-capabilities";

export type RevenueStatus =
  | "a_receber"
  | "recebido"
  | "cancelado"
  | "desconto"
  | "cortesia";

export type Revenue = {
  id: number;
  organizationId: number;
  patientId: number | null;
  payerName: string | null;
  procedureId: number | null;
  appointmentId: number | null;
  healthPlanId: number | null;
  paymentMethodId: number | null;
  professionalId: number | null;
  locationId: number | null;
  installmentNo: number;
  installmentsTotal: number;
  amount: number;
  status: RevenueStatus;
  dueDate: string | null;
  receivedAt: string | null;
  description: string | null;
  attachmentUrl: string | null;
  sentToOmie: boolean;
  sentToContaAzul: boolean;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateRevenueInput = {
  organizationId: number;
  patientId?: number;
  payerName?: string;
  procedureId?: number;
  appointmentId?: number;
  healthPlanId?: number;
  paymentMethodId?: number;
  professionalId?: number;
  locationId?: number;
  installmentNo?: number;
  installmentsTotal?: number;
  amount: number;
  status?: RevenueStatus;
  dueDate?: string;
  receivedAt?: string;
  description?: string;
  attachmentUrl?: string;
  createdBy?: number;
};

export type UpdateRevenueInput = Partial<
  Omit<CreateRevenueInput, "organizationId">
> & { id: number };

export type RevenueFilter = {
  organizationId: number;
  patientId?: number;
  professionalId?: number;
  locationId?: number;
  status?: RevenueStatus;
  /** Limite documentado: intervalo de pesquisa de até 90 dias (Cap. 15.1). */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export type RevenueSummary = {
  receivedTotal: number;
  toReceiveTotal: number;
};

type RevenueRow = {
  id: number;
  organization_id: number;
  patient_id: number | null;
  payer_name: string | null;
  procedure_id: number | null;
  appointment_id: number | null;
  health_plan_id: number | null;
  payment_method_id: number | null;
  /** Ausentes quando a migração 0003 ainda não foi aplicada. */
  professional_id?: number | null;
  location_id?: number | null;
  installment_no: number | null;
  installments_total: number | null;
  amount: string | number;
  status: string;
  due_date: string | null;
  received_at: string | null;
  description: string | null;
  attachment_url: string | null;
  sent_to_omie: boolean | null;
  sent_to_conta_azul: boolean | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Colunas lidas do banco. `professional_id`/`location_id` só existem depois da
 * migração 0003; até lá a seleção usa apenas as colunas legadas para que a tela
 * de Receitas continue funcionando.
 */
const LEGACY_REVENUE_COLUMNS =
  "id, organization_id, patient_id, payer_name, procedure_id, appointment_id, health_plan_id, payment_method_id, installment_no, installments_total, amount, status, due_date, received_at, description, attachment_url, sent_to_omie, sent_to_conta_azul, created_by, created_at, updated_at";

const LINKED_REVENUE_COLUMNS =
  "id, organization_id, patient_id, payer_name, procedure_id, appointment_id, health_plan_id, payment_method_id, professional_id, location_id, installment_no, installments_total, amount, status, due_date, received_at, description, attachment_url, sent_to_omie, sent_to_conta_azul, created_by, created_at, updated_at" as const;

function revenueColumns(hasLinks: boolean): typeof LINKED_REVENUE_COLUMNS {
  // A lista legada é um subconjunto; o tipo "completo" mantém a inferência das
  // colunas mesmo quando a leitura usa apenas as colunas antigas.
  return (hasLinks
    ? LINKED_REVENUE_COLUMNS
    : LEGACY_REVENUE_COLUMNS) as typeof LINKED_REVENUE_COLUMNS;
}

function toRevenue(row: RevenueRow): Revenue {
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientId: row.patient_id,
    payerName: row.payer_name,
    procedureId: row.procedure_id,
    appointmentId: row.appointment_id,
    healthPlanId: row.health_plan_id,
    paymentMethodId: row.payment_method_id,
    professionalId: row.professional_id ?? null,
    locationId: row.location_id ?? null,
    installmentNo: row.installment_no ?? 1,
    installmentsTotal: row.installments_total ?? 1,
    amount: Number(row.amount),
    status: (row.status as RevenueStatus) ?? "a_receber",
    dueDate: row.due_date,
    receivedAt: row.received_at,
    description: row.description,
    attachmentUrl: row.attachment_url,
    sentToOmie: row.sent_to_omie ?? false,
    sentToContaAzul: row.sent_to_conta_azul ?? false,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fail(context: string, error: { message: string } | null): never {
  console.error(`[RevenueModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} receita`);
}

/** Valida que o intervalo informado não excede 90 dias (Cap. 15.1). */
export function assertRangeWithin90Days(from?: string, to?: string): void {
  if (!from || !to) return;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("Período inválido");
  }
  if (end - start > 90 * 24 * 60 * 60 * 1000) {
    throw new Error("O intervalo de pesquisa não pode ultrapassar 90 dias");
  }
}

export const revenueModel = {
  async create(data: CreateRevenueInput): Promise<Revenue> {
    const caps = await getSchemaCapabilities();
    const wantsLinks = data.professionalId !== undefined || data.locationId !== undefined;
    if (wantsLinks && !caps.revenueLinks) throw new Error(MIGRATION_0003_FIELDS_HINT);

    const payload: Record<string, unknown> = {
      organization_id: data.organizationId,
      patient_id: data.patientId ?? null,
      payer_name: data.payerName ?? null,
      procedure_id: data.procedureId ?? null,
      appointment_id: data.appointmentId ?? null,
      health_plan_id: data.healthPlanId ?? null,
      payment_method_id: data.paymentMethodId ?? null,
      installment_no: data.installmentNo ?? 1,
      installments_total: data.installmentsTotal ?? 1,
      amount: data.amount,
      status: data.status ?? "a_receber",
      due_date: data.dueDate ?? null,
      // Se a receita já nasce RECEBIDA, `received_at` precisa existir: o
      // Repasse e o Extrato filtram por essa data.
      received_at:
        data.receivedAt ??
        (data.status === "recebido" ? new Date().toISOString() : null),
      description: data.description ?? null,
      attachment_url: data.attachmentUrl ?? null,
      created_by: data.createdBy ?? null,
    };
    if (caps.revenueLinks) {
      payload.professional_id = data.professionalId ?? null;
      payload.location_id = data.locationId ?? null;
    }

    const { data: row, error } = await getSupabaseAdmin()
      .from("revenues")
      .insert(payload)
      .select(revenueColumns(caps.revenueLinks))
      .single();
    if (error) fail("criar", error);
    return toRevenue(row);
  },

  async findById(id: number, organizationId: number): Promise<Revenue | null> {
    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin()
      .from("revenues")
      .select(revenueColumns(caps.revenueLinks))
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) fail("consultar", error);
    return row ? toRevenue(row) : null;
  },

  async findMany(filter: RevenueFilter): Promise<Revenue[]> {
    assertRangeWithin90Days(filter.from, filter.to);

    const caps = await getSchemaCapabilities();
    const wantsLinkFilters = filter.professionalId !== undefined || filter.locationId !== undefined;
    if (wantsLinkFilters && !caps.revenueLinks) throw new Error(MIGRATION_0003_FIELDS_HINT);

    let query = getSupabaseAdmin()
      .from("revenues")
      .select(revenueColumns(caps.revenueLinks))
      .eq("organization_id", filter.organizationId)
      .order("created_at", { ascending: false });

    if (filter.patientId) query = query.eq("patient_id", filter.patientId);
    if (filter.professionalId && caps.revenueLinks) {
      query = query.eq("professional_id", filter.professionalId);
    }
    if (filter.locationId && caps.revenueLinks) {
      query = query.eq("location_id", filter.locationId);
    }
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);

    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 50) - 1,
    );
    if (error) fail("listar", error);
    return (data ?? []).map(toRevenue);
  },

  /** Resumo separado de recebidos e a receber (Cap. 15.1). */
  async summarize(filter: RevenueFilter): Promise<RevenueSummary> {
    assertRangeWithin90Days(filter.from, filter.to);

    let query = getSupabaseAdmin()
      .from("revenues")
      .select("amount, status")
      .eq("organization_id", filter.organizationId);

    if (filter.patientId) query = query.eq("patient_id", filter.patientId);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);

    const { data, error } = await query;
    if (error) fail("resumir", error);

    const summary: RevenueSummary = { receivedTotal: 0, toReceiveTotal: 0 };
    for (const row of data ?? []) {
      const amount = Number((row as { amount: string | number }).amount);
      const status = (row as { status: string }).status;
      if (status === "recebido") summary.receivedTotal += amount;
      if (status === "a_receber") summary.toReceiveTotal += amount;
    }
    return summary;
  },

  async update(id: number, organizationId: number, data: UpdateRevenueInput): Promise<Revenue | null> {
    const caps = await getSchemaCapabilities();
    const patch: Record<string, unknown> = {};
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.status !== undefined) patch.status = data.status;
    if (data.payerName !== undefined) patch.payer_name = data.payerName;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.receivedAt !== undefined) patch.received_at = data.receivedAt;
    if (data.description !== undefined) patch.description = data.description;
    if (data.attachmentUrl !== undefined) patch.attachment_url = data.attachmentUrl;
    if (data.paymentMethodId !== undefined) patch.payment_method_id = data.paymentMethodId;
    if (data.professionalId !== undefined || data.locationId !== undefined) {
      if (!caps.revenueLinks) throw new Error(MIGRATION_0003_FIELDS_HINT);
      if (data.professionalId !== undefined) patch.professional_id = data.professionalId;
      if (data.locationId !== undefined) patch.location_id = data.locationId;
    }
    if (data.installmentNo !== undefined) patch.installment_no = data.installmentNo;
    if (data.installmentsTotal !== undefined) patch.installments_total = data.installmentsTotal;

    // Ao marcar como recebido sem data explícita, registra o momento atual
    // para que o Repasse e o Extrato encontrem o lançamento no período.
    if (data.status === "recebido" && data.receivedAt === undefined) {
      patch.received_at = new Date().toISOString();
    }

    if (Object.keys(patch).length === 0) return this.findById(id, organizationId);

    const { data: row, error } = await getSupabaseAdmin()
      .from("revenues")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(revenueColumns(caps.revenueLinks))
      .maybeSingle();
    if (error) fail("atualizar", error);
    return row ? toRevenue(row) : null;
  },

  /**
   * Cancelamento com motivo (Cap. 15.1.1):
   * permitido somente quando status = "a_receber"; a desativação é registrada
   * no histórico da própria receita pelo controller.
   */
  async cancel(
    id: number,
    organizationId: number,
    userId: number | null,
    reason: string,
  ): Promise<Revenue | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status !== "a_receber") {
      throw new Error("Somente receitas com status A RECEBER podem ser canceladas");
    }

    const caps = await getSchemaCapabilities();
    const { data: row, error } = await getSupabaseAdmin()
      .from("revenues")
      .update({ status: "cancelado" })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(revenueColumns(caps.revenueLinks))
      .maybeSingle();
    if (error) fail("cancelar", error);

    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return row ? toRevenue(row) : null;
  },

  /** Histórico de edições/alterações da receita (Cap. 15.1.1). */
  async addHistory(
    revenueId: number,
    userId: number | null,
    action: string,
    changes: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    await getSupabaseAdmin()
      .from("revenue_history")
      .insert({
        revenue_id: revenueId,
        changed_by: userId,
        action,
        changes,
        reason: reason ?? null,
      });
  },

  async listHistory(revenueId: number): Promise<Array<{
    id: number;
    action: string;
    reason: string | null;
    createdAt: string | null;
  }>> {
    const { data, error } = await getSupabaseAdmin()
      .from("revenue_history")
      .select("id, action, reason, created_at")
      .eq("revenue_id", revenueId)
      .order("created_at", { ascending: false });
    if (error) fail("listar histórico", error);
    return (data ?? []).map((row) => ({
      id: (row as { id: number }).id,
      action: (row as { action: string }).action,
      reason: (row as { reason: string | null }).reason ?? null,
      createdAt: (row as { created_at: string | null }).created_at ?? null,
    }));
  },
};
