/**
 * OllCLin - Camada Model
 * Financeiro > Recibos (Cap. 15.5)
 *
 * Regras implementadas:
 * - Emitente: usuário da plataforma ou estabelecimento
 * - Lista de recibos, impressão, histórico e cancelamento com motivo
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import { financeGuarded } from "../lib/schema-capabilities";

export type ReceiptStatus = "emitido" | "cancelado";
export type ReceiptIssuerType = "usuario" | "estabelecimento";

export type Receipt = {
  id: number;
  organizationId: number;
  revenueId: number | null;
  saleId: number | null;
  issuerType: ReceiptIssuerType;
  issuerUserId: number | null;
  issuerEstablishmentId: number | null;
  issuerName: string | null;
  payerName: string;
  amount: number;
  description: string | null;
  status: ReceiptStatus;
  issuedAt: string | null;
  createdBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateReceiptInput = {
  organizationId: number;
  revenueId?: number;
  saleId?: number;
  issuerType: ReceiptIssuerType;
  issuerUserId?: number;
  issuerEstablishmentId?: number;
  payerName: string;
  amount: number;
  description?: string;
  issuedAt?: string;
  createdBy?: number;
};

export type UpdateReceiptInput = Partial<Omit<CreateReceiptInput, "organizationId">>;

export type ReceiptFilter = {
  organizationId: number;
  status?: ReceiptStatus;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

type ReceiptRow = {
  id: number;
  organization_id: number;
  revenue_id: number | null;
  sale_id: number | null;
  issuer_type: string;
  issuer_user_id: number | null;
  issuer_establishment_id: number | null;
  payer_name: string;
  amount: string | number;
  description: string | null;
  status: string;
  issued_at: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
};

const RECEIPT_COLUMNS =
  "id, organization_id, revenue_id, sale_id, issuer_type, issuer_user_id, issuer_establishment_id, payer_name, amount, description, status, issued_at, created_by, created_at, updated_at";

function fail(context: string, error: { message: string } | null): never {
  console.error(`[ReceiptModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} recibo`);
}

function toReceipt(row: ReceiptRow, issuerName?: string | null): Receipt {
  return {
    id: row.id,
    organizationId: row.organization_id,
    revenueId: row.revenue_id,
    saleId: row.sale_id,
    issuerType: (row.issuer_type as ReceiptIssuerType) ?? "usuario",
    issuerUserId: row.issuer_user_id,
    issuerEstablishmentId: row.issuer_establishment_id,
    issuerName: issuerName ?? null,
    payerName: row.payer_name,
    amount: Number(row.amount),
    description: row.description,
    status: (row.status as ReceiptStatus) ?? "emitido",
    issuedAt: row.issued_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveIssuerNames(rows: ReceiptRow[]): Promise<Map<number, string>> {
  const userIds = Array.from(
    new Set(rows.map((row) => row.issuer_user_id).filter((id): id is number => id !== null)),
  );
  const establishmentIds = Array.from(
    new Set(
      rows
        .map((row) => row.issuer_establishment_id)
        .filter((id): id is number => id !== null),
    ),
  );

  const names = new Map<number, string>();
  if (userIds.length > 0) {
    const { data } = await getSupabaseAdmin().from("users").select("id, name").in("id", userIds);
    for (const item of data ?? []) {
      const row = item as { id: number; name: string };
      names.set(row.id, row.name);
    }
  }
  if (establishmentIds.length > 0) {
    const { data } = await getSupabaseAdmin()
      .from("establishments")
      .select("id, name")
      .in("id", establishmentIds);
    for (const item of data ?? []) {
      const row = item as { id: number; name: string };
      names.set(row.id, row.name);
    }
  }
  return names;
}

function issuerNameOf(row: ReceiptRow, names: Map<number, string>): string | null {
  const id = row.issuer_type === "estabelecimento" ? row.issuer_establishment_id : row.issuer_user_id;
  return id ? names.get(id) ?? null : null;
}

export const receiptModel = financeGuarded({
  async create(data: CreateReceiptInput): Promise<Receipt> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("receipts")
      .insert({
        organization_id: data.organizationId,
        revenue_id: data.revenueId ?? null,
        sale_id: data.saleId ?? null,
        issuer_type: data.issuerType,
        issuer_user_id: data.issuerType === "usuario" ? data.issuerUserId ?? null : null,
        issuer_establishment_id:
          data.issuerType === "estabelecimento" ? data.issuerEstablishmentId ?? null : null,
        payer_name: data.payerName,
        amount: data.amount,
        description: data.description ?? null,
        status: "emitido",
        issued_at: data.issuedAt ?? new Date().toISOString(),
        created_by: data.createdBy ?? null,
      })
      .select(RECEIPT_COLUMNS)
      .single<ReceiptRow>();
    if (error || !row) fail("criar", error);

    const names = await resolveIssuerNames([row]);
    await this.addHistory(row.id, data.createdBy ?? null, "CREATE", {
      amount: data.amount,
      payerName: data.payerName,
    });
    return toReceipt(row, issuerNameOf(row, names));
  },

  async findById(id: number, organizationId: number): Promise<Receipt | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("receipts")
      .select(RECEIPT_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<ReceiptRow>();
    if (error) fail("consultar", error);
    if (!row) return null;
    const names = await resolveIssuerNames([row]);
    return toReceipt(row, issuerNameOf(row, names));
  },

  async findMany(filter: ReceiptFilter): Promise<Receipt[]> {
    let query = getSupabaseAdmin()
      .from("receipts")
      .select(RECEIPT_COLUMNS)
      .eq("organization_id", filter.organizationId)
      .order("issued_at", { ascending: false });

    if (filter.status) query = query.eq("status", filter.status);
    if (filter.from) query = query.gte("issued_at", `${filter.from}T00:00:00`);
    if (filter.to) query = query.lte("issued_at", `${filter.to}T23:59:59`);

    if (filter.search) {
      const term = filter.search.replace(/[%,()]/g, "").trim();
      if (term) query = query.or(`payer_name.ilike.%${term}%,description.ilike.%${term}%`);
    }

    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 100) - 1,
    );
    if (error) fail("listar", error);
    const rows = (data ?? []) as ReceiptRow[];
    const names = await resolveIssuerNames(rows);
    return rows.map((row) => toReceipt(row, issuerNameOf(row, names)));
  },

  async update(
    id: number,
    organizationId: number,
    data: UpdateReceiptInput,
  ): Promise<Receipt | null> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.revenueId !== undefined) patch.revenue_id = data.revenueId;
    if (data.saleId !== undefined) patch.sale_id = data.saleId;
    if (data.issuerType !== undefined) patch.issuer_type = data.issuerType;
    if (data.issuerUserId !== undefined) patch.issuer_user_id = data.issuerUserId;
    if (data.issuerEstablishmentId !== undefined) {
      patch.issuer_establishment_id = data.issuerEstablishmentId;
    }
    if (data.payerName !== undefined) patch.payer_name = data.payerName;
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.description !== undefined) patch.description = data.description;
    if (data.issuedAt !== undefined) patch.issued_at = data.issuedAt;

    const { error } = await getSupabaseAdmin()
      .from("receipts")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) fail("atualizar", error);

    await this.addHistory(id, null, "UPDATE", data as Record<string, unknown>);
    return this.findById(id, organizationId);
  },

  async cancel(
    id: number,
    organizationId: number,
    userId: number | null,
    reason: string,
  ): Promise<Receipt | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status === "cancelado") {
      throw new Error("Recibo já está cancelado");
    }

    const { error } = await getSupabaseAdmin()
      .from("receipts")
      .update({ status: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) fail("cancelar", error);

    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return this.findById(id, organizationId);
  },

  async addHistory(
    receiptId: number,
    userId: number | null,
    action: string,
    changes: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("receipt_history")
      .insert({
        receipt_id: receiptId,
        changed_by: userId,
        action,
        changes,
        reason: reason ?? null,
      });
    if (error) console.error("[ReceiptModel] histórico:", error.message);
  },

  async listHistory(receiptId: number): Promise<Array<{
    id: number;
    action: string;
    reason: string | null;
    createdAt: string | null;
  }>> {
    const { data, error } = await getSupabaseAdmin()
      .from("receipt_history")
      .select("id, action, reason, created_at")
      .eq("receipt_id", receiptId)
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
