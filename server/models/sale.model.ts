/**
 * OllCLin - Camada Model
 * Financeiro > Vendas (Cap. 15.1.2)
 *
 * Regras implementadas:
 * - Cabeçalho + múltiplas linhas (procedimentos) por venda
 * - Status: A RECEBER, RECEBIDO e CANCELADA
 * - Totais: Total a Receber, Total Recebido e Total geral (canceladas fora)
 * - Cancelamento com motivo registrado no histórico
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import { financeGuarded } from "../lib/schema-capabilities";

export type SaleStatus = "a_receber" | "recebido" | "cancelada";

export type SaleItemInput = {
  procedureId?: number;
  professionalId?: number;
  description?: string;
  quantity: number;
  unitAmount: number;
};

export type SaleItem = {
  id: number;
  procedureId: number | null;
  professionalId: number | null;
  description: string | null;
  quantity: number;
  unitAmount: number;
  amount: number;
};

export type Sale = {
  id: number;
  organizationId: number;
  patientId: number | null;
  payerName: string | null;
  healthPlanId: number | null;
  paymentMethodId: number | null;
  locationId: number | null;
  professionalId: number | null;
  installmentNo: number;
  installmentsTotal: number;
  amount: number;
  status: SaleStatus;
  issuedAt: string | null;
  receivedAt: string | null;
  description: string | null;
  attachmentUrl: string | null;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: SaleItem[];
};

export type CreateSaleInput = {
  organizationId: number;
  patientId?: number;
  payerName?: string;
  healthPlanId?: number;
  paymentMethodId?: number;
  locationId?: number;
  professionalId?: number;
  installmentNo?: number;
  installmentsTotal?: number;
  amount: number;
  status?: SaleStatus;
  issuedAt?: string;
  receivedAt?: string;
  description?: string;
  attachmentUrl?: string;
  createdBy?: number;
  items?: SaleItemInput[];
};

export type UpdateSaleInput = Partial<Omit<CreateSaleInput, "organizationId">> & {
  id: number;
};

export type SaleFilter = {
  organizationId: number;
  status?: SaleStatus;
  professionalId?: number;
  healthPlanId?: number;
  paymentMethodId?: number;
  locationId?: number;
  procedureId?: number;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export type SaleSummary = {
  toReceiveTotal: number;
  receivedTotal: number;
  generalTotal: number;
};

type SaleRow = {
  id: number;
  organization_id: number;
  patient_id: number | null;
  payer_name: string | null;
  health_plan_id: number | null;
  payment_method_id: number | null;
  location_id: number | null;
  professional_id: number | null;
  installment_no: number | null;
  installments_total: number | null;
  amount: string | number;
  status: string;
  issued_at: string | null;
  received_at: string | null;
  description: string | null;
  attachment_url: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  sale_items?: SaleItemRow[];
};

type SaleItemRow = {
  id: number;
  procedure_id: number | null;
  professional_id: number | null;
  description: string | null;
  quantity: string | number | null;
  unit_amount: string | number | null;
  amount: string | number | null;
};

const SALE_COLUMNS =
  "id, organization_id, patient_id, payer_name, health_plan_id, payment_method_id, location_id, professional_id, installment_no, installments_total, amount, status, issued_at, received_at, description, attachment_url, created_by, created_at, updated_at";

const SALE_ITEM_COLUMNS =
  "id, procedure_id, professional_id, description, quantity, unit_amount, amount";

function toItem(row: SaleItemRow): SaleItem {
  const quantity = Number(row.quantity ?? 1);
  const unitAmount = Number(row.unit_amount ?? 0);
  return {
    id: row.id,
    procedureId: row.procedure_id,
    professionalId: row.professional_id,
    description: row.description,
    quantity,
    unitAmount,
    amount: Number(row.amount ?? quantity * unitAmount),
  };
}

function toSale(row: SaleRow): Sale {
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientId: row.patient_id,
    payerName: row.payer_name,
    healthPlanId: row.health_plan_id,
    paymentMethodId: row.payment_method_id,
    locationId: row.location_id,
    professionalId: row.professional_id,
    installmentNo: row.installment_no ?? 1,
    installmentsTotal: row.installments_total ?? 1,
    amount: Number(row.amount),
    status: (row.status as SaleStatus) ?? "a_receber",
    issuedAt: row.issued_at,
    receivedAt: row.received_at,
    description: row.description,
    attachmentUrl: row.attachment_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.sale_items ?? []).map(toItem),
  };
}

function fail(context: string, error: { message: string } | null): never {
  console.error(`[SaleModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} venda`);
}

function itemRows(saleId: number, items: SaleItemInput[]): Record<string, unknown>[] {
  return items.map((item) => ({
    sale_id: saleId,
    procedure_id: item.procedureId ?? null,
    professional_id: item.professionalId ?? null,
    description: item.description ?? null,
    quantity: item.quantity,
    unit_amount: item.unitAmount,
    amount: Number((item.quantity * item.unitAmount).toFixed(2)),
  }));
}

export const saleModel = financeGuarded({
  async create(data: CreateSaleInput): Promise<Sale> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("sales")
      .insert({
        organization_id: data.organizationId,
        patient_id: data.patientId ?? null,
        payer_name: data.payerName ?? null,
        health_plan_id: data.healthPlanId ?? null,
        payment_method_id: data.paymentMethodId ?? null,
        location_id: data.locationId ?? null,
        professional_id: data.professionalId ?? null,
        installment_no: data.installmentNo ?? 1,
        installments_total: data.installmentsTotal ?? 1,
        amount: data.amount,
        status: data.status ?? "a_receber",
        issued_at: data.issuedAt ?? new Date().toISOString().slice(0, 10),
        received_at: data.receivedAt ?? null,
        description: data.description ?? null,
        attachment_url: data.attachmentUrl ?? null,
        created_by: data.createdBy ?? null,
      })
      .select(SALE_COLUMNS)
      .single<SaleRow>();
    if (error || !row) fail("criar", error);

    let items: SaleItem[] = [];
    if (data.items && data.items.length > 0) {
      const { data: itemData, error: itemError } = await getSupabaseAdmin()
        .from("sale_items")
        .insert(itemRows(row.id, data.items))
        .select(SALE_ITEM_COLUMNS);
      if (itemError) fail("criar itens da", itemError);
      items = (itemData ?? []).map((item) => toItem(item as SaleItemRow));
    }

    return { ...toSale(row), items };
  },

  async findById(id: number, organizationId: number): Promise<Sale | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("sales")
      .select(`${SALE_COLUMNS}, sale_items(${SALE_ITEM_COLUMNS})`)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<SaleRow>();
    if (error) fail("consultar", error);
    return row ? toSale(row) : null;
  },

  async findMany(filter: SaleFilter): Promise<Sale[]> {
    let query = getSupabaseAdmin()
      .from("sales")
      .select(`${SALE_COLUMNS}, sale_items(${SALE_ITEM_COLUMNS})`)
      .eq("organization_id", filter.organizationId)
      .order("issued_at", { ascending: false });

    if (filter.status) query = query.eq("status", filter.status);
    if (filter.professionalId) query = query.eq("professional_id", filter.professionalId);
    if (filter.healthPlanId) query = query.eq("health_plan_id", filter.healthPlanId);
    if (filter.paymentMethodId) query = query.eq("payment_method_id", filter.paymentMethodId);
    if (filter.locationId) query = query.eq("location_id", filter.locationId);
    if (filter.from) query = query.gte("issued_at", filter.from);
    if (filter.to) query = query.lte("issued_at", filter.to);

    if (filter.search) {
      const term = filter.search.replace(/[%,()]/g, "").trim();
      if (term) {
        query = query.or(`payer_name.ilike.%${term}%,description.ilike.%${term}%`);
      }
    }

    if (filter.procedureId) {
      const { data: itemRowsData, error: itemError } = await getSupabaseAdmin()
        .from("sale_items")
        .select("sale_id")
        .eq("procedure_id", filter.procedureId);
      if (itemError) fail("filtrar por procedimento", itemError);
      const ids = Array.from(
        new Set((itemRowsData ?? []).map((item) => (item as { sale_id: number }).sale_id)),
      );
      if (ids.length === 0) return [];
      query = query.in("id", ids);
    }

    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 100) - 1,
    );
    if (error) fail("listar", error);
    return (data ?? []).map((row) => toSale(row as SaleRow));
  },

  /** Totais da tela; vendas canceladas ficam fora de todos os totais (Cap. 15.1.2). */
  async summarize(filter: SaleFilter): Promise<SaleSummary> {
    const rows = await this.findMany({ ...filter, limit: 1000, offset: 0, status: undefined });
    const summary: SaleSummary = {
      toReceiveTotal: 0,
      receivedTotal: 0,
      generalTotal: 0,
    };
    for (const sale of rows) {
      if (sale.status === "a_receber") summary.toReceiveTotal += sale.amount;
      if (sale.status === "recebido") summary.receivedTotal += sale.amount;
    }
    summary.generalTotal = summary.toReceiveTotal + summary.receivedTotal;
    return summary;
  },

  async update(
    id: number,
    organizationId: number,
    data: UpdateSaleInput,
  ): Promise<Sale | null> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.status !== undefined) patch.status = data.status;
    if (data.payerName !== undefined) patch.payer_name = data.payerName;
    if (data.patientId !== undefined) patch.patient_id = data.patientId;
    if (data.healthPlanId !== undefined) patch.health_plan_id = data.healthPlanId;
    if (data.paymentMethodId !== undefined) patch.payment_method_id = data.paymentMethodId;
    if (data.locationId !== undefined) patch.location_id = data.locationId;
    if (data.professionalId !== undefined) patch.professional_id = data.professionalId;
    if (data.installmentNo !== undefined) patch.installment_no = data.installmentNo;
    if (data.installmentsTotal !== undefined) patch.installments_total = data.installmentsTotal;
    if (data.issuedAt !== undefined) patch.issued_at = data.issuedAt;
    if (data.receivedAt !== undefined) patch.received_at = data.receivedAt;
    if (data.description !== undefined) patch.description = data.description;
    if (data.attachmentUrl !== undefined) patch.attachment_url = data.attachmentUrl;
    if (data.status === "recebido" && data.receivedAt === undefined) {
      patch.received_at = new Date().toISOString();
    }

    const { error } = await getSupabaseAdmin()
      .from("sales")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) fail("atualizar", error);

    if (data.items) {
      const { error: deleteError } = await getSupabaseAdmin()
        .from("sale_items")
        .delete()
        .eq("sale_id", id);
      if (deleteError) fail("substituir itens da", deleteError);

      if (data.items.length > 0) {
        const { error: insertError } = await getSupabaseAdmin()
          .from("sale_items")
          .insert(itemRows(id, data.items));
        if (insertError) fail("atualizar itens da", insertError);
      }
    }

    return this.findById(id, organizationId);
  },

  async cancel(
    id: number,
    organizationId: number,
    userId: number | null,
    reason: string,
  ): Promise<Sale | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status === "cancelada") {
      throw new Error("Venda já está cancelada");
    }

    const { error } = await getSupabaseAdmin()
      .from("sales")
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) fail("cancelar", error);

    await this.addHistory(id, userId, "CANCEL", { status: "cancelada" }, reason);
    return this.findById(id, organizationId);
  },

  async addHistory(
    saleId: number,
    userId: number | null,
    action: string,
    changes: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("sale_history")
      .insert({
        sale_id: saleId,
        changed_by: userId,
        action,
        changes,
        reason: reason ?? null,
      });
    if (error) console.error("[SaleModel] histórico:", error.message);
  },

  async listHistory(saleId: number): Promise<Array<{
    id: number;
    action: string;
    reason: string | null;
    createdAt: string | null;
  }>> {
    const { data, error } = await getSupabaseAdmin()
      .from("sale_history")
      .select("id, action, reason, created_at")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false });
    if (error) fail("listar histórico", error);
    return (data ?? []).map((row) => ({
      id: (row as { id: number }).id,
      action: (row as { action: string }).action,
      reason: (row as { reason: string | null }).reason ?? null,
      createdAt: (row as { created_at: string | null }).created_at ?? null,
    }));
  },
});
