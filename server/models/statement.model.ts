/**
 * OllCLin - Camada Model
 * Financeiro > Extrato (Cap. 15.4)
 *
 * O extrato é derivado dos lançamentos já existentes (sem tabela paralela):
 * - Entradas: receitas recebidas e vendas recebidas
 * - Saídas: despesas pagas e repasses confirmados
 * Balanço do período = entradas - saídas (respeitando os filtros).
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import { financeGuarded } from "../lib/schema-capabilities";

export type StatementSource = "receita" | "venda" | "despesa" | "repasse";
export type StatementType = "entrada" | "saida";

export type StatementEntry = {
  id: string;
  referenceId: number;
  type: StatementType;
  source: StatementSource;
  date: string | null;
  description: string;
  counterpart: string | null;
  amount: number;
};

export type StatementFilter = {
  organizationId: number;
  from?: string;
  to?: string;
  type?: StatementType;
  source?: StatementSource;
  limit?: number;
  offset?: number;
};

export type StatementSummary = {
  entriesTotal: number;
  exitsTotal: number;
  balance: number;
};

type Row = Record<string, unknown>;

function fail(context: string, error: { message: string } | null): never {
  console.error(`[StatementModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context} extrato`);
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export const statementModel = financeGuarded({
  async list(filter: StatementFilter): Promise<{ entries: StatementEntry[]; summary: StatementSummary }> {
    const entries: StatementEntry[] = [];

    const [revenues, sales, expenses, payouts] = await Promise.all([
      getSupabaseAdmin()
        .from("revenues")
        .select("id, description, payer_name, amount, received_at, created_at")
        .eq("organization_id", filter.organizationId)
        .eq("status", "recebido"),
      getSupabaseAdmin()
        .from("sales")
        .select("id, description, payer_name, amount, received_at, issued_at")
        .eq("organization_id", filter.organizationId)
        .eq("status", "recebido"),
      getSupabaseAdmin()
        .from("expenses")
        .select("id, description, payee_name, amount, paid_at, due_date")
        .eq("organization_id", filter.organizationId)
        .eq("status", "pago"),
      getSupabaseAdmin()
        .from("payouts")
        .select("id, notes, amount, professional_id, created_at")
        .eq("organization_id", filter.organizationId)
        .eq("status", "confirmado"),
    ]);

    if (revenues.error) fail("listar receitas", revenues.error);
    if (sales.error) fail("listar vendas", sales.error);
    if (expenses.error) fail("listar despesas", expenses.error);
    if (payouts.error) fail("listar repasses", payouts.error);

    for (const item of revenues.data ?? []) {
      const row = item as Row;
      entries.push({
        id: `receita-${row.id}`,
        referenceId: row.id as number,
        type: "entrada",
        source: "receita",
        date: dateOnly((row.received_at as string | null) ?? (row.created_at as string | null)),
        description: (row.description as string | null) || `Receita #${row.id}`,
        counterpart: (row.payer_name as string | null) ?? null,
        amount: Number(row.amount),
      });
    }

    for (const item of sales.data ?? []) {
      const row = item as Row;
      entries.push({
        id: `venda-${row.id}`,
        referenceId: row.id as number,
        type: "entrada",
        source: "venda",
        date: dateOnly((row.received_at as string | null) ?? (row.issued_at as string | null)),
        description: (row.description as string | null) || `Venda #${row.id}`,
        counterpart: (row.payer_name as string | null) ?? null,
        amount: Number(row.amount),
      });
    }

    for (const item of expenses.data ?? []) {
      const row = item as Row;
      entries.push({
        id: `despesa-${row.id}`,
        referenceId: row.id as number,
        type: "saida",
        source: "despesa",
        date: dateOnly((row.paid_at as string | null) ?? (row.due_date as string | null)),
        description: (row.description as string | null) || `Despesa #${row.id}`,
        counterpart: (row.payee_name as string | null) ?? null,
        amount: Number(row.amount),
      });
    }

    const professionalIds = Array.from(
      new Set(
        (payouts.data ?? [])
          .map((item) => (item as Row).professional_id)
          .filter((id): id is number => typeof id === "number"),
      ),
    );
    const professionalNames = new Map<number, string>();
    if (professionalIds.length > 0) {
      const { data } = await getSupabaseAdmin()
        .from("professionals")
        .select("id, full_name")
        .in("id", professionalIds);
      for (const item of data ?? []) {
        const row = item as { id: number; full_name: string };
        professionalNames.set(row.id, row.full_name);
      }
    }

    for (const item of payouts.data ?? []) {
      const row = item as Row;
      const professionalName = professionalNames.get(row.professional_id as number);
      entries.push({
        id: `repasse-${row.id}`,
        referenceId: row.id as number,
        type: "saida",
        source: "repasse",
        date: dateOnly(row.created_at as string | null),
        description: (row.notes as string | null) || `Repasse #${row.id}`,
        counterpart: professionalName ?? null,
        amount: Number(row.amount),
      });
    }

    const filtered = entries
      .filter((entry) => {
        if (filter.type && entry.type !== filter.type) return false;
        if (filter.source && entry.source !== filter.source) return false;
        if (filter.from && entry.date && entry.date < filter.from) return false;
        if (filter.to && entry.date && entry.date > filter.to) return false;
        return true;
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

    const summary = filtered.reduce<StatementSummary>(
      (acc, entry) => {
        if (entry.type === "entrada") acc.entriesTotal += entry.amount;
        else acc.exitsTotal += entry.amount;
        return acc;
      },
      { entriesTotal: 0, exitsTotal: 0, balance: 0 },
    );
    summary.entriesTotal = round2(summary.entriesTotal);
    summary.exitsTotal = round2(summary.exitsTotal);
    summary.balance = round2(summary.entriesTotal - summary.exitsTotal);

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return { entries: filtered.slice(offset, offset + limit), summary };
  },
});
