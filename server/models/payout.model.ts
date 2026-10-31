/**
 * OllCLin - Camada Model
 * Financeiro > Repasse (Cap. 15.3)
 *
 * Regras implementadas:
 * - Aba Receitas: recebimentos elegíveis (status RECEBIDO) por profissional,
 *   local e intervalo; estados Não Repassado / Repassado (Cap. 15.3.1).
 * - Percentual padrão vem do profissional, com ajuste manual.
 * - Diferença entre esperado e valor repassado vira retroativo no próximo
 *   repasse do mesmo profissional + local (Cap. 15.3.1).
 * - Aba Repasses: histórico, cancelamento com motivo; ao cancelar, as receitas
 *   voltam a ficar elegíveis para reprocessamento (Cap. 15.3.2).
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import { financeGuarded } from "../lib/schema-capabilities";

export type PayoutStatus = "confirmado" | "cancelado";
export type PayoutRevenueFilter = "nao_repassado" | "repassado" | "todos";

export type EligibleRevenue = {
  id: number;
  patientId: number | null;
  patientName: string | null;
  description: string | null;
  amount: number;
  receivedAt: string | null;
  repassed: boolean;
};

export type Payout = {
  id: number;
  organizationId: number;
  professionalId: number;
  professionalName: string | null;
  locationId: number | null;
  locationName: string | null;
  periodStart: string;
  periodEnd: string;
  percentage: number;
  expectedAmount: number;
  carryoverAmount: number;
  amount: number;
  status: PayoutStatus;
  notes: string | null;
  createdBy: number | null;
  createdAt: string | null;
};

export type CreatePayoutInput = {
  organizationId: number;
  professionalId: number;
  locationId?: number;
  periodStart: string;
  periodEnd: string;
  percentage: number;
  amount?: number;
  revenueIds: number[];
  notes?: string;
  createdBy?: number;
};

export type PayoutFilter = {
  organizationId: number;
  professionalId?: number;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

type PayoutRow = {
  id: number;
  organization_id: number;
  professional_id: number;
  location_id: number | null;
  period_start: string;
  period_end: string;
  percentage: string | number;
  expected_amount: string | number;
  carryover_amount: string | number;
  amount: string | number;
  status: string;
  notes: string | null;
  created_by: number | null;
  created_at: string | null;
};

type RevenueRow = {
  id: number;
  patient_id: number | null;
  description: string | null;
  amount: string | number;
  received_at: string | null;
};

const PAYOUT_COLUMNS =
  "id, organization_id, professional_id, location_id, period_start, period_end, percentage, expected_amount, carryover_amount, amount, status, notes, created_by, created_at";

function fail(context: string, error: { message: string } | null): never {
  console.error(`[PayoutModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} repasse`);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function toPayout(row: PayoutRow, names?: { professionalName?: string | null; locationName?: string | null }): Payout {
  return {
    id: row.id,
    organizationId: row.organization_id,
    professionalId: row.professional_id,
    professionalName: names?.professionalName ?? null,
    locationId: row.location_id,
    locationName: names?.locationName ?? null,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    percentage: Number(row.percentage),
    expectedAmount: Number(row.expected_amount),
    carryoverAmount: Number(row.carryover_amount),
    amount: Number(row.amount),
    status: (row.status as PayoutStatus) ?? "confirmado",
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

async function nameMaps(organizationId: number, rows: PayoutRow[]) {
  const professionalIds = Array.from(new Set(rows.map((row) => row.professional_id)));
  const locationIds = Array.from(
    new Set(rows.map((row) => row.location_id).filter((id): id is number => id !== null)),
  );

  const professionals = new Map<number, string>();
  const locations = new Map<number, string>();

  if (professionalIds.length > 0) {
    const { data } = await getSupabaseAdmin()
      .from("professionals")
      .select("id, full_name")
      .eq("organization_id", organizationId)
      .in("id", professionalIds);
    for (const item of data ?? []) {
      const row = item as { id: number; full_name: string };
      professionals.set(row.id, row.full_name);
    }
  }

  if (locationIds.length > 0) {
    const { data } = await getSupabaseAdmin()
      .from("locations")
      .select("id, name")
      .in("id", locationIds);
    for (const item of data ?? []) {
      const row = item as { id: number; name: string };
      locations.set(row.id, row.name);
    }
  }

  return { professionals, locations };
}

export const payoutModel = financeGuarded({
  /** Percentual configurado no profissional (Cap. 15.3.1). */
  async getProfessionalPercentage(organizationId: number, professionalId: number): Promise<number> {
    const { data, error } = await getSupabaseAdmin()
      .from("professionals")
      .select("commission_percentage")
      .eq("id", professionalId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) fail("consultar percentual do profissional", error);
    return Number((data as { commission_percentage: string | number } | null)?.commission_percentage ?? 0);
  },

  /**
   * Retroativo pendente: diferenças positivas de repasses anteriores ainda não
   * compensadas por um carryover já lançado.
   */
  async pendingCarryover(
    organizationId: number,
    professionalId: number,
    locationId?: number,
  ): Promise<number> {
    let query = getSupabaseAdmin()
      .from("payouts")
      .select("expected_amount, carryover_amount, amount")
      .eq("organization_id", organizationId)
      .eq("professional_id", professionalId)
      .eq("status", "confirmado");
    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query;
    if (error) fail("calcular retroativo", error);

    let shortfall = 0;
    let compensated = 0;
    for (const item of data ?? []) {
      const row = item as {
        expected_amount: string | number;
        carryover_amount: string | number;
        amount: string | number;
      };
      const expected = Number(row.expected_amount);
      const carryover = Number(row.carryover_amount);
      const paid = Number(row.amount);
      // valor pago que efetivamente cobriu o esperado (sem o retroativo embutido)
      const paidTowardExpected = Math.max(0, paid - carryover);
      shortfall += Math.max(0, expected - paidTowardExpected);
      compensated += carryover;
    }
    return round2(Math.max(0, shortfall - compensated));
  },

  /** Recebimentos elegíveis com marcação de já repassados (Cap. 15.3.1). */
  async listEligibleRevenues(input: {
    organizationId: number;
    professionalId: number;
    locationId?: number;
    from: string;
    to: string;
    status?: PayoutRevenueFilter;
  }): Promise<EligibleRevenue[]> {
    let query = getSupabaseAdmin()
      .from("revenues")
      .select("id, patient_id, description, amount, received_at")
      .eq("organization_id", input.organizationId)
      .eq("status", "recebido")
      .eq("professional_id", input.professionalId)
      .gte("received_at", `${input.from}T00:00:00`)
      .lte("received_at", `${input.to}T23:59:59`)
      .order("received_at", { ascending: true });

    if (input.locationId) query = query.eq("location_id", input.locationId);

    const { data, error } = await query;
    if (error) fail("listar receitas elegíveis", error);
    const rows = (data ?? []) as RevenueRow[];

    const repassed = new Set<number>();
    if (rows.length > 0) {
      const { data: itemData, error: itemError } = await getSupabaseAdmin()
        .from("payout_items")
        .select("revenue_id, payouts!inner(status)")
        .in("revenue_id", rows.map((row) => row.id));
      if (itemError) fail("consultar repasses das receitas", itemError);
      for (const item of itemData ?? []) {
        const row = item as {
          revenue_id: number;
          payouts: { status: string } | { status: string }[] | null;
        };
        const payout = Array.isArray(row.payouts) ? row.payouts[0] : row.payouts;
        if (payout?.status === "confirmado") repassed.add(row.revenue_id);
      }
    }

    const patientIds = Array.from(
      new Set(rows.map((row) => row.patient_id).filter((id): id is number => id !== null)),
    );
    const patients = new Map<number, string>();
    if (patientIds.length > 0) {
      const { data: patientData } = await getSupabaseAdmin()
        .from("patients")
        .select("id, full_name")
        .in("id", patientIds);
      for (const item of patientData ?? []) {
        const row = item as { id: number; full_name: string };
        patients.set(row.id, row.full_name);
      }
    }

    const status = input.status ?? "todos";
    return rows
      .map((row) => ({
        id: row.id,
        patientId: row.patient_id,
        patientName: row.patient_id ? patients.get(row.patient_id) ?? null : null,
        description: row.description,
        amount: Number(row.amount),
        receivedAt: row.received_at,
        repassed: repassed.has(row.id),
      }))
      .filter((row) => {
        if (status === "nao_repassado") return !row.repassed;
        if (status === "repassado") return row.repassed;
        return true;
      });
  },

  async create(data: CreatePayoutInput): Promise<Payout> {
    if (data.revenueIds.length === 0) {
      throw new Error("Selecione ao menos uma receita para repassar");
    }

    const { data: revenueData, error: revenueError } = await getSupabaseAdmin()
      .from("revenues")
      .select("id, amount")
      .eq("organization_id", data.organizationId)
      .eq("status", "recebido")
      .eq("professional_id", data.professionalId)
      .in("id", data.revenueIds);
    if (revenueError) fail("validar receitas", revenueError);

    const revenues = (revenueData ?? []) as Array<{ id: number; amount: string | number }>;
    if (revenues.length !== data.revenueIds.length) {
      throw new Error("Uma ou mais receitas não estão elegíveis para repasse");
    }

    const base = revenues.reduce((total, row) => total + Number(row.amount), 0);
    const expectedAmount = round2((base * data.percentage) / 100);
    const carryoverAmount = await this.pendingCarryover(
      data.organizationId,
      data.professionalId,
      data.locationId,
    );
    const amount = round2(data.amount ?? expectedAmount + carryoverAmount);

    const { data: row, error } = await getSupabaseAdmin()
      .from("payouts")
      .insert({
        organization_id: data.organizationId,
        professional_id: data.professionalId,
        location_id: data.locationId ?? null,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        percentage: data.percentage,
        expected_amount: expectedAmount,
        carryover_amount: carryoverAmount,
        amount,
        status: "confirmado",
        notes: data.notes ?? null,
        created_by: data.createdBy ?? null,
      })
      .select(PAYOUT_COLUMNS)
      .single<PayoutRow>();
    if (error || !row) fail("criar", error);

    const { error: itemError } = await getSupabaseAdmin()
      .from("payout_items")
      .insert(
        revenues.map((revenue) => ({
          payout_id: row.id,
          revenue_id: revenue.id,
          amount: Number(revenue.amount),
        })),
      );
    if (itemError) fail("criar itens do", itemError);

    await this.addHistory(row.id, data.createdBy ?? null, "CREATE", {
      percentage: data.percentage,
      expectedAmount,
      carryoverAmount,
      amount,
      revenueIds: data.revenueIds,
    });

    return toPayout(row);
  },

  async list(filter: PayoutFilter): Promise<Payout[]> {
    let query = getSupabaseAdmin()
      .from("payouts")
      .select(PAYOUT_COLUMNS)
      .eq("organization_id", filter.organizationId)
      .order("created_at", { ascending: false });

    if (filter.professionalId) query = query.eq("professional_id", filter.professionalId);
    if (filter.from) query = query.gte("period_start", filter.from);
    if (filter.to) query = query.lte("period_end", filter.to);

    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 100) - 1,
    );
    if (error) fail("listar", error);

    const rows = (data ?? []) as PayoutRow[];
    const maps = await nameMaps(filter.organizationId, rows);
    return rows.map((row) =>
      toPayout(row, {
        professionalName: maps.professionals.get(row.professional_id) ?? null,
        locationName: row.location_id ? maps.locations.get(row.location_id) ?? null : null,
      }),
    );
  },

  async cancel(
    id: number,
    organizationId: number,
    userId: number | null,
    reason: string,
  ): Promise<Payout | null> {
    const { data: existing, error: findError } = await getSupabaseAdmin()
      .from("payouts")
      .select(PAYOUT_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle<PayoutRow>();
    if (findError) fail("consultar", findError);
    if (!existing) return null;
    if (existing.status === "cancelado") {
      throw new Error("Repasse já está cancelado");
    }

    const { error } = await getSupabaseAdmin()
      .from("payouts")
      .update({ status: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) fail("cancelar", error);

    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return toPayout(existing);
  },

  async addHistory(
    payoutId: number,
    userId: number | null,
    action: string,
    changes: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("payout_history")
      .insert({
        payout_id: payoutId,
        changed_by: userId,
        action,
        changes,
        reason: reason ?? null,
      });
    if (error) console.error("[PayoutModel] histórico:", error.message);
  },

  async listHistory(payoutId: number): Promise<Array<{
    id: number;
    action: string;
    reason: string | null;
    createdAt: string | null;
  }>> {
    const { data, error } = await getSupabaseAdmin()
      .from("payout_history")
      .select("id, action, reason, created_at")
      .eq("payout_id", payoutId)
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
