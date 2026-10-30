/**
 * OllCLin - Camada Model
 * Modelo de dados para Categorias de Despesa e Despesas
 * Arquitetura MVC - Acesso ao banco via Supabase (PostgreSQL)
 *
 * Requisitos (briefing Cap. 08.2 e 15.2):
 * - Categorias hierárquicas (pai/subcategoria), Fixas e Variáveis mínimas
 * - Despesas: favorecido, categoria dentro do tipo, parcelas condicionais,
 *   recorrência, anexo, cancelamento com motivo, histórico por despesa
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

/* ------------------------------ Categorias ------------------------------ */

export type ExpenseCategory = {
  id: number;
  organizationId: number;
  parentId: number | null;
  name: string;
  kind: "fixa" | "variavel";
  isActive: boolean;
};

export type ExpenseCategoryRow = {
  id: number;
  organization_id: number;
  parent_id: number | null;
  name: string;
  kind: string;
  is_active: boolean | null;
};

const CATEGORY_COLUMNS = "id, organization_id, parent_id, name, kind, is_active";

function toCategory(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: row.id,
    organizationId: row.organization_id,
    parentId: row.parent_id,
    name: row.name,
    kind: row.kind === "fixa" ? "fixa" : "variavel",
    isActive: row.is_active ?? true,
  };
}

function fail(context: string, error: { message: string } | null): never {
  console.error(`[ExpenseModel] ${context}:`, error?.message);
  throw new Error(`Falha ao ${context}`);
}

/* -------------------------------- Despesas -------------------------------- */

export type Expense = {
  id: number;
  organizationId: number;
  expenseCategoryId: number | null;
  payeeName: string | null;
  paymentMethodId: number | null;
  installmentNo: number;
  installmentsTotal: number;
  amount: number;
  status: "a_pagar" | "pago" | "cancelado";
  dueDate: string | null;
  paidAt: string | null;
  description: string | null;
  attachmentUrl: string | null;
  recurrenceRule: string | null;
  createdBy: number | null;
  createdAt: string | null;
};

export type CreateExpenseInput = {
  organizationId: number;
  expenseCategoryId?: number;
  payeeName?: string;
  paymentMethodId?: number;
  installmentNo?: number;
  installmentsTotal?: number;
  amount: number;
  status?: Expense["status"];
  dueDate?: string;
  paidAt?: string;
  description?: string;
  attachmentUrl?: string;
  recurrenceRule?: string;
  createdBy?: number;
};

export type UpdateExpenseInput = Partial<Omit<CreateExpenseInput, "organizationId">> & { id: number };

export type ExpenseFilter = {
  organizationId: number;
  status?: Expense["status"];
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

type ExpenseRow = {
  id: number;
  organization_id: number;
  expense_category_id: number | null;
  payee_name: string | null;
  payment_method_id: number | null;
  installment_no: number | null;
  installments_total: number | null;
  amount: string | number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  description: string | null;
  attachment_url: string | null;
  recurrence_rule: string | null;
  created_by: number | null;
  created_at: string | null;
};

const EXPENSE_COLUMNS =
  "id, organization_id, expense_category_id, payee_name, payment_method_id, installment_no, installments_total, amount, status, due_date, paid_at, description, attachment_url, recurrence_rule, created_by, created_at";

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    organizationId: row.organization_id,
    expenseCategoryId: row.expense_category_id,
    payeeName: row.payee_name,
    paymentMethodId: row.payment_method_id,
    installmentNo: row.installment_no ?? 1,
    installmentsTotal: row.installments_total ?? 1,
    amount: Number(row.amount),
    status: (row.status as Expense["status"]) ?? "a_pagar",
    dueDate: row.due_date,
    paidAt: row.paid_at,
    description: row.description,
    attachmentUrl: row.attachment_url,
    recurrenceRule: row.recurrence_rule,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const expenseModel = {
  /* ------------------------------ categorias ------------------------------ */

  async listCategories(organizationId: number): Promise<ExpenseCategory[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("expense_categories")
      .select(CATEGORY_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name");
    if (error) fail("listar categorias", error);
    return (data ?? []).map(toCategory);
  },

  async createCategory(organizationId: number, name: string, kind: "fixa" | "variavel", parentId?: number): Promise<ExpenseCategory> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("expense_categories")
      .insert({
        organization_id: organizationId,
        name,
        kind,
        parent_id: parentId ?? null,
      })
      .select(CATEGORY_COLUMNS)
      .single();
    if (error) fail("criar categoria", error);
    return toCategory(row);
  },

  async deleteCategory(id: number, organizationId: number): Promise<boolean> {
    const { error } = await getSupabaseAdmin()
      .from("expense_categories")
      .update({ is_active: false })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) fail("inativar categoria", error);
    return true;
  },

  /* -------------------------------- despesas ------------------------------- */

  async create(data: CreateExpenseInput): Promise<Expense> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("expenses")
      .insert({
        organization_id: data.organizationId,
        expense_category_id: data.expenseCategoryId ?? null,
        payee_name: data.payeeName ?? null,
        payment_method_id: data.paymentMethodId ?? null,
        installment_no: data.installmentNo ?? 1,
        installments_total: data.installmentsTotal ?? 1,
        amount: data.amount,
        status: data.status ?? "a_pagar",
        due_date: data.dueDate ?? null,
        paid_at: data.paidAt ?? null,
        description: data.description ?? null,
        attachment_url: data.attachmentUrl ?? null,
        recurrence_rule: data.recurrenceRule ?? null,
        created_by: data.createdBy ?? null,
      })
      .select(EXPENSE_COLUMNS)
      .single();
    if (error) fail("criar despesa", error);
    return toExpense(row);
  },

  async findById(id: number, organizationId: number): Promise<Expense | null> {
    const { data: row, error } = await getSupabaseAdmin()
      .from("expenses")
      .select(EXPENSE_COLUMNS)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) fail("consultar despesa", error);
    return row ? toExpense(row) : null;
  },

  async findMany(filter: ExpenseFilter): Promise<Expense[]> {
    let query = getSupabaseAdmin()
      .from("expenses")
      .select(EXPENSE_COLUMNS)
      .eq("organization_id", filter.organizationId)
      .order("created_at", { ascending: false });
    if (filter.status) query = query.eq("status", filter.status);
    if (filter.from) query = query.gte("created_at", filter.from);
    if (filter.to) query = query.lte("created_at", filter.to);
    const { data, error } = await query.range(
      filter.offset ?? 0,
      (filter.offset ?? 0) + (filter.limit ?? 50) - 1,
    );
    if (error) fail("listar despesas", error);
    return (data ?? []).map(toExpense);
  },

  /** Resumo: pago / a pagar / atrasado (Cap. 15.2). */
  async summarize(organizationId: number): Promise<{ paidTotal: number; toPayTotal: number; overdueTotal: number }> {
    const { data, error } = await getSupabaseAdmin()
      .from("expenses")
      .select("amount, status, due_date")
      .eq("organization_id", organizationId);
    if (error) fail("resumir despesas", error);

    const today = new Date().toISOString().slice(0, 10);
    const summary = { paidTotal: 0, toPayTotal: 0, overdueTotal: 0 };
    for (const row of data ?? []) {
      const amount = Number((row as { amount: string | number }).amount);
      const status = (row as { status: string }).status;
      const due = (row as { due_date: string | null }).due_date;
      if (status === "pago") summary.paidTotal += amount;
      if (status === "a_pagar") {
        summary.toPayTotal += amount;
        if (due && due < today) summary.overdueTotal += amount;
      }
    }
    return summary;
  },

  async update(id: number, organizationId: number, data: UpdateExpenseInput): Promise<Expense | null> {
    const patch: Record<string, unknown> = {};
    if (data.amount !== undefined) patch.amount = data.amount;
    if (data.status !== undefined) patch.status = data.status;
    if (data.payeeName !== undefined) patch.payee_name = data.payeeName;
    if (data.dueDate !== undefined) patch.due_date = data.dueDate;
    if (data.paidAt !== undefined) patch.paid_at = data.paidAt;
    if (data.description !== undefined) patch.description = data.description;
    if (data.attachmentUrl !== undefined) patch.attachment_url = data.attachmentUrl;
    if (data.expenseCategoryId !== undefined) patch.expense_category_id = data.expenseCategoryId;
    if (data.paymentMethodId !== undefined) patch.payment_method_id = data.paymentMethodId;
    if (data.installmentNo !== undefined) patch.installment_no = data.installmentNo;
    if (data.installmentsTotal !== undefined) patch.installments_total = data.installmentsTotal;
    if (data.recurrenceRule !== undefined) patch.recurrence_rule = data.recurrenceRule;
    if (Object.keys(patch).length === 0) return this.findById(id, organizationId);

    const { data: row, error } = await getSupabaseAdmin()
      .from("expenses")
      .update(patch)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(EXPENSE_COLUMNS)
      .maybeSingle();
    if (error) fail("atualizar despesa", error);
    return row ? toExpense(row) : null;
  },

  /** Cancelamento exige motivo (Cap. 15.2); permitido para não pagas. */
  async cancel(id: number, organizationId: number, userId: number | null, reason: string): Promise<Expense | null> {
    const existing = await this.findById(id, organizationId);
    if (!existing) return null;
    if (existing.status === "cancelado") {
      throw new Error("Despesa já está cancelada");
    }
    if (existing.status === "pago") {
      throw new Error("Despesa paga não pode ser cancelada");
    }

    const { data: row, error } = await getSupabaseAdmin()
      .from("expenses")
      .update({ status: "cancelado" })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(EXPENSE_COLUMNS)
      .maybeSingle();
    if (error) fail("cancelar despesa", error);

    await this.addHistory(id, userId, "CANCEL", { status: "cancelado" }, reason);
    return row ? toExpense(row) : null;
  },

  async addHistory(expenseId: number, userId: number | null, action: string, changes: Record<string, unknown>, reason?: string): Promise<void> {
    await getSupabaseAdmin().from("expense_history").insert({
      expense_id: expenseId,
      changed_by: userId,
      action,
      changes,
      reason: reason ?? null,
    });
  },

  async listHistory(expenseId: number): Promise<Array<{ id: number; action: string; reason: string | null; createdAt: string | null }>> {
    const { data, error } = await getSupabaseAdmin()
      .from("expense_history")
      .select("id, action, reason, created_at")
      .eq("expense_id", expenseId)
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
