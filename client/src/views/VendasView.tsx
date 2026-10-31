/**
 * OllCLin - View: Financeiro > Vendas
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos (briefing Cap. 15.1.2):
 * - Venda com cabeçalho + múltiplas linhas de procedimentos
 * - Status A Receber, Recebido e Cancelada
 * - Totais: a receber, recebido e geral (canceladas fora dos totais)
 * - Cancelamento com motivo obrigatório + histórico
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  ShoppingCart,
  Search,
  Plus,
  Loader2,
  History,
  Ban,
  Trash2,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

type SaleItem = {
  id?: number;
  procedureId: number | null;
  professionalId: number | null;
  description: string | null;
  quantity: number;
  unitAmount: number;
  amount: number;
};

type Sale = {
  id: number;
  patientId: number | null;
  payerName: string | null;
  installmentNo: number;
  installmentsTotal: number;
  amount: number;
  status: "a_receber" | "recebido" | "cancelada";
  issuedAt: string | null;
  description: string | null;
  items: SaleItem[];
};

type SaleSummary = {
  toReceiveTotal: number;
  receivedTotal: number;
  generalTotal: number;
};

type FormItem = {
  procedureId: string;
  professionalId: string;
  description: string;
  quantity: string;
  unitAmount: string;
};

const emptyItem = (): FormItem => ({
  procedureId: "",
  professionalId: "",
  description: "",
  quantity: "1",
  unitAmount: "",
});

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  patientId: "",
  payerName: "",
  healthPlanId: "",
  paymentMethodId: "",
  locationId: "",
  professionalId: "",
  installmentNo: "1",
  installmentsTotal: "1",
  status: "a_receber",
  issuedAt: today(),
  description: "",
  items: [emptyItem()],
};

const STATUS_LABEL: Record<string, string> = {
  a_receber: "A Receber",
  recebido: "Recebido",
  cancelada: "Cancelada",
};

const STATUS_STYLE: Record<string, string> = {
  a_receber: "bg-amber-100 text-amber-800",
  recebido: "bg-emerald-100 text-emerald-700",
  cancelada: "bg-gray-100 text-gray-500",
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

export default function VendasView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SaleSummary>({
    toReceiveTotal: 0,
    receivedTotal: 0,
    generalTotal: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<
    Array<{ id: number; action: string; reason: string | null; createdAt: string | null }>
  >([]);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const utils = trpc.useUtils();

  const { data: patientsData } = trpc.pacientes.list.useQuery({
    organizationId: ORGANIZATION_ID,
    isActive: true,
    limit: 200,
  });
  const { data: professionalsData } = trpc.profissionais.list.useQuery({
    organizationId: ORGANIZATION_ID,
    isActive: true,
    limit: 200,
  });
  const { data: proceduresData } = trpc.procedimentos.list.useQuery({
    organizationId: ORGANIZATION_ID,
    isActive: true,
    limit: 200,
  });
  const { data: locationsData } = trpc.configuracoes.locations.useQuery({
    organizationId: ORGANIZATION_ID,
  });
  const { data: paymentMethodsData } = trpc.receitas.paymentMethods.useQuery({
    organizationId: ORGANIZATION_ID,
  });
  const { data: plansData } = trpc.convenios.list.useQuery({
    organizationId: ORGANIZATION_ID,
    isActive: true,
    limit: 100,
  });

  const patients = (patientsData ?? []) as Array<{ id: number; fullName: string }>;
  const professionals = (professionalsData ?? []) as Array<{
    id: number;
    fullName: string;
  }>;
  const procedures = (proceduresData ?? []) as Array<{
    id: number;
    name: string;
    price: string | null;
  }>;
  const locations = (locationsData ?? []) as Array<{ id: number; name: string }>;
  const paymentMethods = (paymentMethodsData ?? []) as Array<{ id: number; name: string }>;
  const plans = (plansData ?? []) as Array<{ id: number; operatorName: string }>;

  const patientName = useMemo(() => {
    const map = new Map<number, string>();
    patients.forEach((p) => map.set(p.id, p.fullName));
    return map;
  }, [patients]);

  const total = form.items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const unit = parseAmount(item.unitAmount) || 0;
    return sum + qty * unit;
  }, 0);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const filter = {
        organizationId: ORGANIZATION_ID,
        status:
          statusFilter === "todas"
            ? undefined
            : (statusFilter as "a_receber" | "recebido" | "cancelada"),
        search: search || undefined,
        limit: 100,
      };
      const data = await utils.vendas.list.fetch(filter);
      setSales(data as unknown as Sale[]);
      const s = await utils.vendas.summary.fetch({
        organizationId: ORGANIZATION_ID,
        search: search || undefined,
      });
      setSummary(s as SaleSummary);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar as vendas");
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, utils]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, items: [emptyItem()] });
    setDialogOpen(true);
  }

  function updateItem(index: number, patch: Partial<FormItem>) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function selectProcedure(index: number, procedureId: string) {
    const procedure = procedures.find((p) => p.id === Number(procedureId));
    updateItem(index, {
      procedureId,
      description: procedure?.name ?? "",
      unitAmount: procedure?.price ?? "",
    });
  }

  async function handleSave() {
    if (total <= 0) {
      toast.error("Informe ao menos um item com valor maior que zero");
      return;
    }
    setSaving(true);
    try {
      await utils.client.vendas.create.mutate({
        organizationId: ORGANIZATION_ID,
        patientId: form.patientId ? Number(form.patientId) : undefined,
        payerName: form.payerName.trim() || undefined,
        healthPlanId: form.healthPlanId ? Number(form.healthPlanId) : undefined,
        paymentMethodId: form.paymentMethodId ? Number(form.paymentMethodId) : undefined,
        locationId: form.locationId ? Number(form.locationId) : undefined,
        professionalId: form.professionalId ? Number(form.professionalId) : undefined,
        installmentNo: Math.max(1, Number(form.installmentNo) || 1),
        installmentsTotal: Math.max(1, Number(form.installmentsTotal) || 1),
        status: form.status as "a_receber" | "recebido",
        issuedAt: form.issuedAt || undefined,
        description: form.description.trim() || undefined,
        amount: Number(total.toFixed(2)),
        items: form.items.map((item) => ({
          procedureId: item.procedureId ? Number(item.procedureId) : undefined,
          professionalId: item.professionalId ? Number(item.professionalId) : undefined,
          description: item.description.trim() || undefined,
          quantity: Math.max(0.01, Number(item.quantity) || 1),
          unitAmount: parseAmount(item.unitAmount) || 0,
        })),
      });
      toast.success("Venda registrada");
      setDialogOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao salvar a venda");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(sale: Sale) {
    try {
      const rows = await utils.vendas.history.fetch({
        id: sale.id,
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
      await utils.client.vendas.cancel.mutate({
        id: cancelTarget.id,
        organizationId: ORGANIZATION_ID,
        reason: cancelReason.trim(),
      });
      toast.success("Venda cancelada");
      setCancelTarget(null);
      setCancelReason("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao cancelar a venda");
    }
  }

  return (
    <div className="p-2 space-y-4">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Vendas
            </h1>
            <p className="text-muted text-sm mt-1">
              Registre vendas de procedimentos e acompanhe o que falta receber.
            </p>
          </div>
          <Button onClick={openCreate} className="bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> Nova venda
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por pagador, descrição ou ID..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos os status</SelectItem>
              <SelectItem value="a_receber">A Receber</SelectItem>
              <SelectItem value="recebido">Recebido</SelectItem>
              <SelectItem value="cancelada">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : sales.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">Nenhuma venda registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Paciente / Pagador</TableHead>
                  <TableHead className="text-center">Itens</TableHead>
                  <TableHead className="text-center">Parcela</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="text-sm">{sale.issuedAt?.slice(0, 10) ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {sale.patientId
                        ? patientName.get(sale.patientId) ?? sale.payerName ?? `Paciente #${sale.patientId}`
                        : sale.payerName || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-center">{sale.items.length}</TableCell>
                    <TableCell className="text-sm text-center">
                      {sale.installmentsTotal > 1
                        ? `${sale.installmentNo}/${sale.installmentsTotal}`
                        : "—"}
                    </TableCell>
                    <TableCell className="font-semibold">{brl(sale.amount)}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLE[sale.status] ?? "bg-gray-100"}>
                        {STATUS_LABEL[sale.status] ?? sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" title="Histórico" onClick={() => openHistory(sale)}>
                          <History className="h-4 w-4" />
                        </Button>
                        {sale.status !== "cancelada" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Cancelar (exige motivo)"
                            onClick={() => {
                              setCancelTarget(sale);
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
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-muted">A receber:</span>
            <span className="font-bold text-amber-700 ml-auto">{brl(summary.toReceiveTotal)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-muted">Recebido:</span>
            <span className="font-bold text-emerald-700 ml-auto">{brl(summary.receivedTotal)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <span className="text-muted">Total geral:</span>
            <span className="font-bold text-foreground ml-auto">{brl(summary.generalTotal)}</span>
          </div>
        </div>
      </div>

      {/* Nova venda */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova venda</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Paciente</Label>
                <Select
                  value={form.patientId}
                  onValueChange={(v) => setForm({ ...form, patientId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payerName">Pagador diferente (opcional)</Label>
                <Input
                  id="payerName"
                  value={form.payerName}
                  onChange={(e) => setForm({ ...form, payerName: e.target.value })}
                  placeholder="Nome do pagador"
                />
              </div>
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
                    {paymentMethods.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
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
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.operatorName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Local de atendimento</Label>
                <Select
                  value={form.locationId}
                  onValueChange={(v) => setForm({ ...form, locationId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Profissional responsável</Label>
                <Select
                  value={form.professionalId}
                  onValueChange={(v) => setForm({ ...form, professionalId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issuedAt">Data</Label>
                <Input
                  id="issuedAt"
                  type="date"
                  value={form.issuedAt}
                  onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_receber">A Receber</SelectItem>
                    <SelectItem value="recebido">Recebido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="installmentNo">Parcela</Label>
                <Input
                  id="installmentNo"
                  type="number"
                  min={1}
                  max={48}
                  value={form.installmentNo}
                  onChange={(e) => setForm({ ...form, installmentNo: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="installmentsTotal">Total de parcelas</Label>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Itens da venda</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar item
                </Button>
              </div>
              {form.items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 rounded-lg border border-line p-2"
                >
                  <div className="sm:col-span-4">
                    <Select
                      value={item.procedureId}
                      onValueChange={(v) => selectProcedure(index, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Procedimento" />
                      </SelectTrigger>
                      <SelectContent>
                        {procedures.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Descrição do item"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: e.target.value })}
                      placeholder="Qtd"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      inputMode="decimal"
                      value={item.unitAmount}
                      onChange={(e) => updateItem(index, { unitAmount: e.target.value })}
                      placeholder="Valor unit."
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-end gap-1">
                    <span className="text-sm font-medium">
                      {brl((Number(item.quantity) || 0) * (parseAmount(item.unitAmount) || 0))}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={form.items.length === 1}
                      onClick={() =>
                        setForm({
                          ...form,
                          items: form.items.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="saleDescription">Descrição da venda</Label>
              <Input
                id="saleDescription"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t pt-3">
              <span className="text-sm text-muted">Total</span>
              <span className="text-lg font-bold text-foreground">{brl(total)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar venda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico da venda</DialogTitle>
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
            <DialogTitle>Cancelar venda</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted">
              A venda cancelada sai dos totais. O motivo fica registrado no histórico.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="saleCancelReason">Motivo *</Label>
              <Input
                id="saleCancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex.: venda lançada em duplicidade"
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
