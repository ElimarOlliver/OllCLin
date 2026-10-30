/**
 * OllCLin - View: Financeiro > Receitas
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos (briefing Cap. 15.1):
 * - Novo recebimento com pagador alternativo e parcelas
 * - Parcelas exibidas individualmente na listagem (parcela n/N)
 * - Filtros + intervalo limitado a 90 dias (validação no backend)
 * - Resumo: valores recebidos e a receber (canto inferior)
 * - Cancelar apenas status A RECEBER, com motivo obrigatório (Cap. 15.1.1)
 * - Histórico de edições por receita
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Wallet,
  Clock,
  History,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

type Revenue = {
  id: number;
  payerName: string | null;
  amount: number;
  status: string;
  installmentNo: number;
  installmentsTotal: number;
  dueDate: string | null;
  description: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  a_receber: "A Receber",
  recebido: "Recebido",
  cancelado: "Cancelado",
  desconto: "Desconto",
  cortesia: "Cortesia",
};

const STATUS_STYLE: Record<string, string> = {
  a_receber: "bg-amber-100 text-amber-800",
  recebido: "bg-emerald-100 text-emerald-700",
  cancelado: "bg-gray-100 text-gray-500",
  desconto: "bg-blue-100 text-blue-700",
  cortesia: "bg-purple-100 text-purple-700",
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
  payerName: "",
  description: "",
  paymentMethodId: "",
  healthPlanId: "",
  useAlternatePayer: false,
  installmentsTotal: "1",
  dueDate: todayPlus(0),
};

export default function ReceitasView() {
  const [search, setSearch] = useState("");
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [summary, setSummary] = useState({ receivedTotal: 0, toReceiveTotal: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<Array<{ id: number; action: string; reason: string | null; createdAt: string | null }>>([]);
  const [cancelTarget, setCancelTarget] = useState<Revenue | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const utils = trpc.useUtils();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await utils.receitas.list.fetch({
        organizationId: ORGANIZATION_ID,
        limit: 100,
      });
      setRevenues(data as unknown as Revenue[]);
      const s = await utils.receitas.summary.fetch({ organizationId: ORGANIZATION_ID });
      setSummary(s);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar as receitas");
    } finally {
      setIsLoading(false);
    }
  }, [utils]);

  useEffect(() => {
    load();
  }, [load]);

  async function openCreate() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function handleSave() {
    const amount = Number(form.amount.replace(",", "."));
    if (!amount || amount <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (form.useAlternatePayer && form.payerName.trim().length < 2) {
      toast.error("Informe o nome do pagador");
      return;
    }
    setSaving(true);
    try {
      await utils.client.receitas.create.mutate({
        organizationId: ORGANIZATION_ID,
        amount,
        payerName: form.useAlternatePayer ? form.payerName.trim() : undefined,
        description: form.description.trim() || undefined,
        paymentMethodId: form.paymentMethodId ? Number(form.paymentMethodId) : undefined,
        healthPlanId: form.healthPlanId ? Number(form.healthPlanId) : undefined,
        installmentsTotal: Math.max(1, Number(form.installmentsTotal) || 1),
        dueDate: form.dueDate || undefined,
      });
      toast.success("Recebimento registrado");
      setDialogOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao salvar o recebimento");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(rev: Revenue) {
    try {
      const rows = await utils.receitas.history.fetch({
        id: rev.id,
        organizationId: ORGANIZATION_ID,
      });
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
      await utils.client.receitas.cancel.mutate({
        id: cancelTarget.id,
        organizationId: ORGANIZATION_ID,
        reason: cancelReason.trim(),
      });
      toast.success("Receita cancelada");
      setCancelTarget(null);
      setCancelReason("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Falha ao cancelar (somente A RECEBER pode ser cancelado)");
    }
  }

  const visible = revenues.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.description ?? "").toLowerCase().includes(q) ||
      (r.payerName ?? "").toLowerCase().includes(q) ||
      String(r.id).includes(q)
    );
  });

  return (
    <div className="p-2 space-y-4">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Receitas
            </h1>
            <p className="text-muted text-sm mt-1">
              Registre e acompanhe os recebimentos da clínica.
            </p>
          </div>
          <Button onClick={openCreate} className="bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> Novo recebimento
          </Button>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição, pagador ou ID..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : visible.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            Nenhuma receita registrada.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Pagador</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((rev) => (
                <TableRow key={rev.id}>
                  <TableCell className="font-medium">{rev.description || `Receita #${rev.id}`}</TableCell>
                  <TableCell>{rev.payerName || "””"}</TableCell>
                  <TableCell>
                    {rev.installmentsTotal > 1
                      ? `${rev.installmentNo}/${rev.installmentsTotal}`
                      : "””"}
                  </TableCell>
                  <TableCell>{rev.dueDate ?? "””"}</TableCell>
                  <TableCell className="font-semibold">{brl(rev.amount)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[rev.status] ?? "bg-gray-100"}>
                      {STATUS_LABEL[rev.status] ?? rev.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Histórico" onClick={() => openHistory(rev)}>
                        <History className="h-4 w-4" />
                      </Button>
                      {rev.status === "a_receber" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Cancelar (exige motivo)"
                          onClick={() => {
                            setCancelTarget(rev);
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

        {/* Resumo (Cap. 15.1) */}
        <div className="mt-4 flex gap-6 justify-end text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-muted">A receber:</span>
            <span className="font-bold text-amber-700">{brl(summary.toReceiveTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <span className="text-muted">Recebido:</span>
            <span className="font-bold text-emerald-700">{brl(summary.receivedTotal)}</span>
          </div>
        </div>
      </div>

      {/* Novo recebimento */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo recebimento</DialogTitle>
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
            <div className="flex items-center gap-2">
              <Checkbox
                id="useAlternatePayer"
                checked={form.useAlternatePayer}
                onCheckedChange={(v) => setForm({ ...form, useAlternatePayer: v === true })}
              />
              <Label htmlFor="useAlternatePayer" className="font-normal">
                Pagador diferente do paciente
              </Label>
            </div>
            {form.useAlternatePayer && (
              <div className="grid gap-2">
                <Label htmlFor="payerName">Nome do pagador *</Label>
                <Input
                  id="payerName"
                  value={form.payerName}
                  onChange={(e) => setForm({ ...form, payerName: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Forma de pagamento</Label>
                <Select
                  value={form.paymentMethodId}
                  onValueChange={(v) => setForm({ ...form, paymentMethodId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <PaymentMethodOptions />
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Convênio (opcional)</Label>
                <Select
                  value={form.healthPlanId}
                  onValueChange={(v) => setForm({ ...form, healthPlanId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Particular" />
                  </SelectTrigger>
                  <SelectContent>
                    <HealthPlanOptions />
                  </SelectContent>
                </Select>
              </div>
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
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
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

      {/* Histórico */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico da receita</DialogTitle>
          </DialogHeader>
          {historyRows.length === 0 ? (
            <p className="text-muted text-sm py-4 text-center">Sem registros.</p>
          ) : (
            <ul className="space-y-2 py-2 text-sm">
              {historyRows.map((h) => (
                <li key={h.id} className="border-b pb-2">
                  <span className="font-medium">{h.action}</span>
                  {h.reason ? <span className="text-muted"> ”” {h.reason}</span> : null}
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
            <DialogTitle>Cancelar receita</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted">
              Somente receitas com status <strong>A Receber</strong> podem ser canceladas.
              O motivo fica registrado no histórico.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="cancelReason">Motivo *</Label>
              <Input
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex.: pagamento realizado por outro meio"
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

/** Opções de forma de pagamento carregadas do backend (REQ-08-036). */
function PaymentMethodOptions() {
  const { data, isLoading } = trpc.receitas.paymentMethods.useQuery({
    organizationId: ORGANIZATION_ID,
  });
  const methods = (data ?? []) as Array<{ id: number; name: string }>;
  if (isLoading) {
    return (<SelectItem value="loading" disabled>Carregando...</SelectItem>);
  }
  if (methods.length === 0) {
    return (<SelectItem value="none" disabled>Cadastre formas em Configurações Financeiras</SelectItem>);
  }
  return (<>{methods.map((m) => (<SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>))}</>);
}
/** Opções de convênio carregadas do backend. */
function HealthPlanOptions() {
  const [plans, setPlans] = useState<Array<{ id: number; operatorName: string }>>([]);
  const utils = trpc.useUtils();
  useEffect(() => {
    (async () => {
      try {
        const res = await utils.convenios.list.fetch({
          organizationId: ORGANIZATION_ID,
          limit: 50,
        });
        setPlans(res as unknown as typeof plans);
      } catch {
        /* fallback silencioso */
      }
    })();
  }, [utils]);
  return (
    <>
      {plans.map((p) => (
        <SelectItem key={p.id} value={String(p.id)}>
          {p.operatorName}
        </SelectItem>
      ))}
    </>
  );
}
