/**
 * OllCLin - View: Financeiro > Despesas
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos (briefing Cap. 15.2 / Cap. 08.2):
 * - Cadastro com Favorecido, Tipo de Custo -> Categoria, parcelas condicionais,
 *   recorrência, anexo
 * - Resumo: pago / a pagar / atrasado
 * - Cancelamento com motivo obrigatório + histórico
 */

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Loader2,
  ReceiptText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Ban,
  FolderTree,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

type Expense = {
  id: number;
  payeeName: string | null;
  expenseCategoryId: number | null;
  amount: number;
  status: string;
  installmentNo: number;
  installmentsTotal: number;
  dueDate: string | null;
  description: string | null;
  recurrenceRule: string | null;
};

type Category = { id: number; name: string; kind: string; parentId: number | null };

const STATUS_LABEL: Record<string, string> = {
  a_pagar: "A Pagar",
  pago: "Pago",
  cancelado: "Cancelado",
};

const STATUS_STYLE: Record<string, string> = {
  a_pagar: "bg-amber-100 text-amber-800",
  pago: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-gray-100 text-gray-500",
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const emptyForm = {
  amount: "",
  payeeName: "",
  description: "",
  categoryId: "",
  paymentMethodId: "",
  installmentsTotal: "1",
  dueDate: todayPlus(0),
  recurrence: "",
};

export default function DespesasView() {
  const [search, setSearch] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState({ paidTotal: 0, toPayTotal: 0, overdueTotal: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<Array<{ id: number; action: string; reason: string | null; createdAt: string | null }>>([]);
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await utils.despesas.list.fetch({ organizationId: ORGANIZATION_ID, limit: 100 });
      setExpenses(data as unknown as Expense[]);
      const s = await utils.despesas.summary.fetch({ organizationId: ORGANIZATION_ID });
      setSummary(s);
      const cats = await utils.despesas.categories.fetch({ organizationId: ORGANIZATION_ID });
      setCategories(cats as unknown as Category[]);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar as despesas");
    } finally {
      setIsLoading(false);
    }
  }, [utils]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    const amount = Number(form.amount.replace(",", "."));
    if (!amount || amount <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setSaving(true);
    try {
      await utils.client.despesas.create.mutate({
        organizationId: ORGANIZATION_ID,
        amount,
        payeeName: form.payeeName.trim() || undefined,
        description: form.description.trim() || undefined,
        expenseCategoryId: form.categoryId ? Number(form.categoryId) : undefined,
        paymentMethodId: form.paymentMethodId ? Number(form.paymentMethodId) : undefined,
        installmentsTotal: Math.max(1, Number(form.installmentsTotal) || 1),
        dueDate: form.dueDate || undefined,
        recurrenceRule: form.recurrence.trim() || undefined,
      });
      toast.success("Despesa registrada");
      setDialogOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao salvar a despesa");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCategory() {
    if (newCatName.trim().length < 2) {
      toast.error("Informe o nome da categoria");
      return;
    }
    try {
      // Subcategoria dentro de "Variáveis" quando existir (REQ-08-021)
      const parent = categories.find((c) => c.parentId === null && c.kind === "variavel");
      await utils.client.despesas.createCategory.mutate({
        organizationId: ORGANIZATION_ID,
        name: newCatName.trim(),
        kind: "variavel",
        parentId: parent?.id,
      });
      toast.success("Categoria criada");
      setNewCatName("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao criar categoria");
    }
  }

  async function openHistory(exp: Expense) {
    try {
      const rows = await utils.despesas.history.fetch({ id: exp.id, organizationId: ORGANIZATION_ID });
      setHistoryRows(rows as typeof historyRows);
      setHistoryOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao carregar o histórico");
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      toast.error("Motivo do cancelamento é obrigatório");
      return;
    }
    try {
      await utils.client.despesas.cancel.mutate({
        id: cancelTarget.id,
        organizationId: ORGANIZATION_ID,
        reason: cancelReason.trim(),
      });
      toast.success("Despesa cancelada");
      setCancelTarget(null);
      setCancelReason("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao cancelar");
    }
  }

  const visible = expenses.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.description ?? "").toLowerCase().includes(q) ||
      (e.payeeName ?? "").toLowerCase().includes(q) ||
      String(e.id).includes(q)
    );
  });

  return (
    <div className="p-2 space-y-4">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              Despesas
            </h1>
            <p className="text-muted text-sm mt-1">
              Registre e acompanhe os pagamentos da clínica.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCatsOpen(true)}>
              <FolderTree className="h-4 w-4 mr-1" /> Categorias
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="bg-primary text-white hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-1" /> Nova despesa
            </Button>
          </div>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição, favorecido ou ID..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : visible.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">Nenhuma despesa registrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Favorecido</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell className="font-medium">
                    {exp.description || `Despesa #${exp.id}`}
                    {exp.recurrenceRule ? (
                      <span className="ml-2 text-xs text-muted">(recorrente)</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{exp.payeeName || "—"}</TableCell>
                  <TableCell>
                    {exp.installmentsTotal > 1 ? `${exp.installmentNo}/${exp.installmentsTotal}` : "—"}
                  </TableCell>
                  <TableCell>{exp.dueDate ?? "—"}</TableCell>
                  <TableCell className="font-semibold">{brl(exp.amount)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[exp.status] ?? "bg-gray-100"}>
                      {STATUS_LABEL[exp.status] ?? exp.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Histórico" onClick={() => openHistory(exp)}>
                        <History className="h-4 w-4" />
                      </Button>
                      {exp.status === "a_pagar" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Cancelar (exige motivo)"
                          onClick={() => {
                            setCancelTarget(exp);
                            setCancelReason("");
                          }}
                        >
                          <Ban className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Resumo (Cap. 15.2) */}
        <div className="mt-4 flex gap-6 justify-end text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-muted">A pagar:</span>
            <span className="font-bold text-amber-700">{brl(summary.toPayTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-muted">Atrasado:</span>
            <span className="font-bold text-red-600">{brl(summary.overdueTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-muted">Pago:</span>
            <span className="font-bold text-emerald-700">{brl(summary.paidTotal)}</span>
          </div>
        </div>
      </div>

      {/* Nova despesa */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova despesa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="amount">Valor (R$) *</Label>
                <Input
                  id="amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="installmentsTotal">Parcelas</Label>
                <Input
                  id="installmentsTotal"
                  type="number"
                  min={1}
                  max={48}
                  value={form.installmentsTotal}
                  onChange={(e) => setForm({ ...form, installmentsTotal: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Tipo de custo → Categoria</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.parentId ? "— " : ""}
                        {c.name}
                        {!c.parentId ? ` (${c.kind})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Forma de pagamento</Label>
                <Select value={form.paymentMethodId} onValueChange={(v) => setForm({ ...form, paymentMethodId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <PaymentMethodItems />
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payeeName">Favorecido</Label>
              <Input
                id="payeeName"
                value={form.payeeName}
                onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Vencimento</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="recurrence">Esta despesa se repete</Label>
                <Input
                  id="recurrence"
                  value={form.recurrence}
                  onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
                  placeholder="Ex.: mensal (opcional)"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary text-white hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Categorias */}
      <Dialog open={catsOpen} onOpenChange={setCatsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorias de despesa (Cap. 08.2)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nova subcategoria em Variáveis"
              />
              <Button onClick={handleCreateCategory} className="bg-primary text-white hover:bg-primary/90">
                Adicionar
              </Button>
            </div>
            <ul className="text-sm space-y-1">
              {categories
                .filter((c) => c.parentId === null)
                .map((parent) => (
                  <li key={parent.id}>
                    <span className="font-medium">{parent.name}</span>
                    <ul className="ml-4 text-muted">
                      {categories
                        .filter((c) => c.parentId === parent.id)
                        .map((sub) => (
                          <li key={sub.id}>— {sub.name}</li>
                        ))}
                    </ul>
                  </li>
                ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico da despesa</DialogTitle>
          </DialogHeader>
          {historyRows.length === 0 ? (
            <p className="text-muted text-sm py-4 text-center">Sem registros.</p>
          ) : (
            <ul className="space-y-2 py-2 text-sm">
              {historyRows.map((h) => (
                <li key={h.id} className="border-b pb-2">
                  <span className="font-medium">{h.action}</span>
                  {h.reason ? <span className="text-muted"> — {h.reason}</span> : null}
                  <div className="text-xs text-muted">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString("pt-BR") : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancelar com motivo */}
      <Dialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar despesa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted">
              O motivo fica registrado no histórico da despesa.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="cancelExpenseReason">Motivo *</Label>
              <Input
                id="cancelExpenseReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Voltar
            </Button>
            <Button onClick={handleCancel} className="bg-red-600 text-white hover:bg-red-700">
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Formas de pagamento ativas (reutiliza procedure do módulo de receitas). */
function PaymentMethodItems() {
  const { data, isLoading } = trpc.receitas.paymentMethods.useQuery({
    organizationId: ORGANIZATION_ID,
  });
  const methods = (data ?? []) as Array<{ id: number; name: string }>;
  if (isLoading) {
    return <SelectItem value="loading" disabled>Carregando...</SelectItem>;
  }
  if (methods.length === 0) {
    return <SelectItem value="none" disabled>Cadastre formas em Configurações Financeiras</SelectItem>;
  }
  return (
    <>
      {methods.map((m) => (
        <SelectItem key={m.id} value={String(m.id)}>
          {m.name}
        </SelectItem>
      ))}
    </>
  );
}
