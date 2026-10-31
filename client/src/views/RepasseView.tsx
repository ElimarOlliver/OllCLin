/**
 * OllCLin - View: Financeiro > Repasse
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos (briefing Cap. 15.3):
 * - Aba Receitas: recebimentos elegíveis por profissional, local e período,
 *   com estados Não Repassado / Repassado.
 * - Percentual padrão do profissional, ajustável no momento do repasse.
 * - Diferença entre esperado e pago vira retroativo no próximo repasse.
 * - Aba Repasses: histórico, cancelamento com motivo e retorno das receitas
 *   à condição de elegíveis.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  HandCoins,
  Loader2,
  History,
  Ban,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

type EligibleRevenue = {
  id: number;
  patientName: string | null;
  description: string | null;
  amount: number;
  receivedAt: string | null;
  repassed: boolean;
};

type Payout = {
  id: number;
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
  status: "confirmado" | "cancelado";
  notes: string | null;
  createdAt: string | null;
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function isoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export default function RepasseView() {
  const [tab, setTab] = useState("receitas");

  /* ------------------------------ Filtros ------------------------------ */
  const [professionalId, setProfessionalId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(isoDate(new Date()));
  const [statusFilter, setStatusFilter] = useState("nao_repassado");
  const [percentage, setPercentage] = useState("0");
  const [amountOverride, setAmountOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  /* ------------------------------ Repasses ----------------------------- */
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<
    Array<{ id: number; action: string; reason: string | null; createdAt: string | null }>
  >([]);
  const [cancelTarget, setCancelTarget] = useState<Payout | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const utils = trpc.useUtils();

  const { data: professionalsData } = trpc.profissionais.list.useQuery({
    organizationId: ORGANIZATION_ID,
    isActive: true,
    limit: 200,
  });
  const { data: locationsData } = trpc.configuracoes.locations.useQuery({
    organizationId: ORGANIZATION_ID,
  });

  const professionals = (professionalsData ?? []) as Array<{ id: number; fullName: string }>;
  const locations = (locationsData ?? []) as Array<{ id: number; name: string }>;

  const professionalNumber = professionalId ? Number(professionalId) : 0;
  const locationNumber = locationId ? Number(locationId) : undefined;

  const { data: percentageData } = trpc.repasses.professionalPercentage.useQuery(
    { organizationId: ORGANIZATION_ID, professionalId: professionalNumber },
    { enabled: professionalNumber > 0 },
  );

  const { data: carryoverData, refetch: refetchCarryover } = trpc.repasses.carryover.useQuery(
    {
      organizationId: ORGANIZATION_ID,
      professionalId: professionalNumber,
      locationId: locationNumber,
    },
    { enabled: professionalNumber > 0 },
  );

  const {
    data: eligibleData,
    isFetching: loadingEligible,
    refetch: refetchEligible,
  } = trpc.repasses.eligibleRevenues.useQuery(
    {
      organizationId: ORGANIZATION_ID,
      professionalId: professionalNumber,
      locationId: locationNumber,
      from,
      to,
      status: statusFilter as "nao_repassado" | "repassado" | "todos",
    },
    { enabled: professionalNumber > 0 && !!from && !!to },
  );

  const eligible = (eligibleData ?? []) as EligibleRevenue[];
  const carryover = (carryoverData?.amount ?? 0) as number;

  useEffect(() => {
    if (percentageData) setPercentage(String(percentageData.percentage ?? 0));
  }, [percentageData]);

  // Ao trocar profissional/local, reinicia a seleção.
  useEffect(() => {
    setSelected([]);
  }, [professionalId, locationId, from, to, statusFilter]);

  // Não mantém selecionados itens que não estão mais visíveis/elegíveis.
  useEffect(() => {
    setSelected((current) => current.filter((id) => eligible.some((e) => e.id === id && !e.repassed)));
  }, [eligible]);

  const selectedRevenues = useMemo(
    () => eligible.filter((e) => selected.includes(e.id) && !e.repassed),
    [eligible, selected],
  );
  const base = selectedRevenues.reduce((sum, r) => sum + r.amount, 0);
  const pct = Math.max(0, Math.min(100, Number(percentage.replace(",", ".")) || 0));
  const expected = Number(((base * pct) / 100).toFixed(2));
  const suggestedTotal = Number((expected + carryover).toFixed(2));
  const amountToPay = amountOverride.trim()
    ? Number(amountOverride.replace(",", ".")) || 0
    : suggestedTotal;

  const loadPayouts = useCallback(async () => {
    setLoadingPayouts(true);
    try {
      const data = await utils.repasses.list.fetch({
        organizationId: ORGANIZATION_ID,
        limit: 200,
      });
      setPayouts(data as unknown as Payout[]);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar os repasses");
    } finally {
      setLoadingPayouts(false);
    }
  }, [utils]);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts]);

  function toggleRevenue(id: number, checked: boolean) {
    setSelected((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id),
    );
  }

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected([]);
      return;
    }
    setSelected(eligible.filter((e) => !e.repassed).map((e) => e.id));
  }

  async function handleCreatePayout() {
    if (professionalNumber <= 0) {
      toast.error("Selecione um profissional");
      return;
    }
    if (selectedRevenues.length === 0) {
      toast.error("Selecione ao menos uma receita para repassar");
      return;
    }
    if (!from || !to) {
      toast.error("Informe o período do repasse");
      return;
    }

    setSaving(true);
    try {
      await utils.client.repasses.create.mutate({
        organizationId: ORGANIZATION_ID,
        professionalId: professionalNumber,
        locationId: locationNumber,
        periodStart: from,
        periodEnd: to,
        percentage: pct,
        amount: amountOverride.trim() ? amountToPay : undefined,
        revenueIds: selectedRevenues.map((r) => r.id),
        notes: notes.trim() || undefined,
      });
      toast.success("Repasse registrado");
      setSelected([]);
      setAmountOverride("");
      setNotes("");
      await Promise.all([refetchEligible(), refetchCarryover(), loadPayouts()]);
      setTab("repasses");
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao registrar o repasse");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(payout: Payout) {
    try {
      const rows = await utils.repasses.history.fetch({
        id: payout.id,
        organizationId: ORGANIZATION_ID,
      });
      setHistoryRows(rows as typeof historyRows);
      setHistoryOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Falha ao carregar o histórico");
    }
  }

  async function handleCancelPayout() {
    if (!cancelTarget) return;
    if (cancelReason.trim().length < 3) {
      toast.error("Motivo do cancelamento é obrigatório");
      return;
    }
    try {
      await utils.client.repasses.cancel.mutate({
        id: cancelTarget.id,
        organizationId: ORGANIZATION_ID,
        reason: cancelReason.trim(),
      });
      toast.success("Repasse cancelado");
      setCancelTarget(null);
      setCancelReason("");
      await Promise.all([refetchEligible(), refetchCarryover(), loadPayouts()]);
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao cancelar o repasse");
    }
  }

  const allSelectable = eligible.filter((e) => !e.repassed);
  const allSelected = allSelectable.length > 0 && allSelectable.every((e) => selected.includes(e.id));

  return (
    <div className="p-2 space-y-4">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Repasse
          </h1>
          <p className="text-muted text-sm mt-1">
            Apure os recebimentos por profissional e registre os repasses com
            retroativos automáticos.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="receitas">Receitas</TabsTrigger>
            <TabsTrigger value="repasses">Repasses</TabsTrigger>
          </TabsList>

          {/* ------------------------- Aba Receitas ------------------------- */}
          <TabsContent value="receitas" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="grid gap-2">
                <Label>Profissional *</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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
                <Label>Local</Label>
                <Select
                  value={locationId || "todos"}
                  onValueChange={(v) => setLocationId(v === "todos" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os locais</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="from">De</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="to">Até</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Situação</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao_repassado">Não repassado</SelectItem>
                    <SelectItem value="repassado">Repassado</SelectItem>
                    <SelectItem value="todos">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {professionalNumber <= 0 ? (
              <p className="text-muted text-sm py-8 text-center">
                Selecione um profissional para listar os recebimentos elegíveis.
              </p>
            ) : loadingEligible ? (
              <div className="flex items-center justify-center py-8 text-muted">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando receitas...
              </div>
            ) : eligible.length === 0 ? (
              <p className="text-muted text-sm py-8 text-center">
                Nenhum recebimento recebido no período para este profissional/local.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(v) => toggleAll(v === true)}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                      <TableHead>Recebimento</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligible.map((revenue) => (
                      <TableRow key={revenue.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.includes(revenue.id)}
                            disabled={revenue.repassed}
                            onCheckedChange={(v) => toggleRevenue(revenue.id, v === true)}
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {revenue.description || `Receita #${revenue.id}`}
                        </TableCell>
                        <TableCell className="text-sm">{revenue.patientName ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {revenue.receivedAt ? revenue.receivedAt.slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="font-semibold">{brl(revenue.amount)}</TableCell>
                        <TableCell>
                          {revenue.repassed ? (
                            <Badge className="bg-blue-100 text-blue-700">Repassado</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Não repassado</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-line p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="percentage">Percentual de repasse (%)</Label>
                    <Input
                      id="percentage"
                      inputMode="decimal"
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="amountOverride">Valor a repassar (opcional)</Label>
                    <Input
                      id="amountOverride"
                      inputMode="decimal"
                      value={amountOverride}
                      onChange={(e) => setAmountOverride(e.target.value)}
                      placeholder={suggestedTotal.toFixed(2)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex.: desconto acordado"
                  />
                </div>
                <Button
                  onClick={handleCreatePayout}
                  disabled={saving || selectedRevenues.length === 0}
                  className="w-full bg-primary text-white hover:bg-primary/90"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Registrar repasse
                </Button>
              </div>

              <div className="rounded-lg bg-surface/60 p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted">Base selecionada</span>
                  <span className="font-medium">{brl(base)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Valor esperado ({pct}%)</span>
                  <span className="font-medium">{brl(expected)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted flex items-center gap-1">
                    <RotateCcw className="h-3.5 w-3.5" /> Retroativo pendente
                  </span>
                  <span className="font-medium">{brl(carryover)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Total sugerido</span>
                  <span className="text-lg font-bold text-primary">{brl(suggestedTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Valor informado</span>
                  <span className="font-semibold">{brl(amountToPay)}</span>
                </div>
                <p className="text-xs text-muted pt-2">
                  Se o valor pago for menor que o total, a diferença fica como
                  retroativo no próximo repasse do mesmo profissional/local.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ------------------------- Aba Repasses ------------------------- */}
          <TabsContent value="repasses" className="mt-4">
            {loadingPayouts ? (
              <div className="flex items-center justify-center py-8 text-muted">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando repasses...
              </div>
            ) : payouts.length === 0 ? (
              <p className="text-muted text-sm py-8 text-center">
                Nenhum repasse registrado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-center">%</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Retroativo</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="text-sm font-medium">
                          {payout.professionalName ?? `Profissional #${payout.professionalId}`}
                        </TableCell>
                        <TableCell className="text-sm">{payout.locationName ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {payout.periodStart} → {payout.periodEnd}
                        </TableCell>
                        <TableCell className="text-sm text-center">{payout.percentage}%</TableCell>
                        <TableCell className="text-sm text-right">{brl(payout.expectedAmount)}</TableCell>
                        <TableCell className="text-sm text-right">{brl(payout.carryoverAmount)}</TableCell>
                        <TableCell className="font-semibold text-right">{brl(payout.amount)}</TableCell>
                        <TableCell>
                          {payout.status === "confirmado" ? (
                            <Badge className="bg-emerald-100 text-emerald-700">Confirmado</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-500">Cancelado</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Histórico"
                              onClick={() => openHistory(payout)}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            {payout.status === "confirmado" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Cancelar (exige motivo)"
                                onClick={() => {
                                  setCancelTarget(payout);
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-muted">Confirmados:</span>
                <span className="font-bold text-emerald-700 ml-auto">
                  {brl(
                    payouts
                      .filter((p) => p.status === "confirmado")
                      .reduce((sum, p) => sum + p.amount, 0),
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-muted">Retroativos pagos:</span>
                <span className="font-bold text-foreground ml-auto">
                  {brl(
                    payouts
                      .filter((p) => p.status === "confirmado")
                      .reduce((sum, p) => sum + p.carryoverAmount, 0),
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                <HandCoins className="h-4 w-4 text-primary" />
                <span className="text-muted">Registros:</span>
                <span className="font-bold text-foreground ml-auto">{payouts.length}</span>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Histórico */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico do repasse</DialogTitle>
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
            <DialogTitle>Cancelar repasse</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted">
              Ao cancelar, as receitas vinculadas voltam a ficar disponíveis para
              um novo repasse. O motivo fica no histórico.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="payoutCancelReason">Motivo *</Label>
              <Input
                id="payoutCancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Voltar
            </Button>
            <Button onClick={handleCancelPayout} className="bg-red-600 text-white hover:bg-red-700">
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
