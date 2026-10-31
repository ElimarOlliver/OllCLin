/**
 * OllCLin - View: Financeiro > Recibos
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos (briefing Cap. 15.5):
 * - Emitente usuário da plataforma ou estabelecimento
 * - Emissão a partir de receita recebida (opcional) ou avulsa
 * - Impressão do recibo, histórico e cancelamento com motivo
 */

import { useCallback, useEffect, useState } from "react";
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
  FileText,
  Search,
  Plus,
  Loader2,
  History,
  Ban,
  Printer,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const ORGANIZATION_ID = 1;

type Receipt = {
  id: number;
  revenueId: number | null;
  issuerType: "usuario" | "estabelecimento";
  issuerUserId: number | null;
  issuerEstablishmentId: number | null;
  issuerName: string | null;
  payerName: string;
  amount: number;
  description: string | null;
  status: "emitido" | "cancelado";
  issuedAt: string | null;
  createdAt: string | null;
};

type Revenue = {
  id: number;
  payerName: string | null;
  description: string | null;
  amount: number;
};

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = {
  issuerType: "usuario",
  issuerId: "",
  revenueId: "",
  payerName: "",
  amount: "",
  description: "",
  issuedAt: today(),
};

export default function RecibosView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<
    Array<{ id: number; action: string; reason: string | null; createdAt: string | null }>
  >([]);
  const [cancelTarget, setCancelTarget] = useState<Receipt | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const utils = trpc.useUtils();

  const { data: issuerOptions } = trpc.recibos.issuerOptions.useQuery({
    organizationId: ORGANIZATION_ID,
  });
  const { data: revenuesData } = trpc.receitas.list.useQuery({
    organizationId: ORGANIZATION_ID,
    status: "recebido",
    limit: 200,
  });

  const users = (issuerOptions?.users ?? []) as Array<{ id: number; name: string }>;
  const establishments = (issuerOptions?.establishments ?? []) as Array<{
    id: number;
    name: string;
  }>;
  const revenues = (revenuesData ?? []) as unknown as Revenue[];

  const issuerList = form.issuerType === "estabelecimento" ? establishments : users;

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await utils.recibos.list.fetch({
        organizationId: ORGANIZATION_ID,
        status:
          statusFilter === "todos"
            ? undefined
            : (statusFilter as "emitido" | "cancelado"),
        search: search || undefined,
        limit: 100,
      });
      setReceipts(data as unknown as Receipt[]);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível carregar os recibos");
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, utils]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, issuedAt: today() });
    setDialogOpen(true);
  }

  function selectRevenue(value: string) {
    const revenue = revenues.find((r) => r.id === Number(value));
    setForm((prev) => ({
      ...prev,
      revenueId: value,
      payerName: revenue?.payerName || prev.payerName,
      amount: revenue ? String(revenue.amount) : prev.amount,
      description: revenue?.description || prev.description,
    }));
  }

  async function handleSave() {
    if (form.payerName.trim().length < 2) {
      toast.error("Informe o nome do pagador");
      return;
    }
    const amount = Number(form.amount.replace(",", "."));
    if (!amount || amount <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!form.issuerId) {
      toast.error(
        form.issuerType === "estabelecimento"
          ? "Selecione o estabelecimento emitente"
          : "Selecione o usuário emitente",
      );
      return;
    }

    setSaving(true);
    try {
      await utils.client.recibos.create.mutate({
        organizationId: ORGANIZATION_ID,
        revenueId: form.revenueId ? Number(form.revenueId) : undefined,
        issuerType: form.issuerType as "usuario" | "estabelecimento",
        issuerUserId:
          form.issuerType === "usuario" ? Number(form.issuerId) : undefined,
        issuerEstablishmentId:
          form.issuerType === "estabelecimento" ? Number(form.issuerId) : undefined,
        payerName: form.payerName.trim(),
        amount,
        description: form.description.trim() || undefined,
        issuedAt: form.issuedAt ? new Date(`${form.issuedAt}T12:00:00`).toISOString() : undefined,
      });
      toast.success("Recibo emitido");
      setDialogOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao emitir o recibo");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory(receipt: Receipt) {
    try {
      const rows = await utils.recibos.history.fetch({
        id: receipt.id,
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
      await utils.client.recibos.cancel.mutate({
        id: cancelTarget.id,
        organizationId: ORGANIZATION_ID,
        reason: cancelReason.trim(),
      });
      toast.success("Recibo cancelado");
      setCancelTarget(null);
      setCancelReason("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error((error as Error).message || "Falha ao cancelar o recibo");
    }
  }

  function printReceipt(receipt: Receipt) {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) {
      toast.error("Permita pop-ups para imprimir o recibo");
      return;
    }

    const issued = receipt.issuedAt ? new Date(receipt.issuedAt) : new Date();
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Recibo #${receipt.id} - OllCLin</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2F80ED; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: 700; color: #2F80ED; }
    .muted { color: #6B7280; font-size: 12px; }
    .title { font-size: 18px; font-weight: 700; margin: 24px 0 8px; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E5E7EB; font-size: 14px; }
    .amount { margin-top: 28px; padding: 16px; background: #F8FAFC; border: 1px solid #D9E6F2; border-radius: 8px; font-size: 20px; font-weight: 700; color: #111827; }
    .label { color: #6B7280; }
    .signature { margin-top: 64px; border-top: 1px solid #111827; width: 280px; text-align: center; padding-top: 8px; font-size: 13px; }
    .canceled { color: #B91C1C; font-weight: 700; margin-top: 12px; }
    @media print { body { padding: 24px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">OllCLin</div>
      <div class="muted">Sistema de gestão clínica</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700">RECIBO Nº ${receipt.id}</div>
      <div class="muted">${issued.toLocaleDateString("pt-BR")}</div>
    </div>
  </div>

  <div class="title">Recibo de pagamento</div>
  <div class="row"><span class="label">Emitente</span><span>${receipt.issuerName ?? "—"}</span></div>
  <div class="row"><span class="label">Pagador</span><span>${receipt.payerName}</span></div>
  <div class="row"><span class="label">Referente a</span><span>${receipt.description ?? "Serviços prestados"}</span></div>
  <div class="amount">Valor: ${brl(receipt.amount)}</div>
  ${receipt.status === "cancelado" ? '<div class="canceled">RECIBO CANCELADO</div>' : ""}
  <p class="muted" style="margin-top:24px">
    Declaro ter recebido a importância acima referente aos serviços descritos.
  </p>
  <div class="signature">${receipt.issuerName ?? "Emitente"}</div>
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  return (
    <div className="p-2 space-y-4">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Recibos
            </h1>
            <p className="text-muted text-sm mt-1">
              Emita, imprima e gerencie recibos de pagamento da clínica.
            </p>
          </div>
          <Button onClick={openCreate} className="bg-primary text-white hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> Novo recibo
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por pagador ou descrição..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="emitido">Emitidos</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando recibos...
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">Nenhum recibo emitido.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Emitente</TableHead>
                  <TableHead>Pagador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell className="font-mono text-sm">#{receipt.id}</TableCell>
                    <TableCell className="text-sm">{receipt.issuerName ?? "—"}</TableCell>
                    <TableCell className="text-sm font-medium">{receipt.payerName}</TableCell>
                    <TableCell className="text-sm">
                      {receipt.issuedAt
                        ? new Date(receipt.issuedAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell className="font-semibold">{brl(receipt.amount)}</TableCell>
                    <TableCell>
                      {receipt.status === "emitido" ? (
                        <Badge className="bg-emerald-100 text-emerald-700">Emitido</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-500">Cancelado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Imprimir recibo"
                          onClick={() => printReceipt(receipt)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Histórico"
                          onClick={() => openHistory(receipt)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {receipt.status === "emitido" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Cancelar (exige motivo)"
                            onClick={() => {
                              setCancelTarget(receipt);
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
      </div>

      {/* Novo recibo */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo recibo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Tipo de emitente</Label>
                <Select
                  value={form.issuerType}
                  onValueChange={(v) =>
                    setForm({ ...form, issuerType: v, issuerId: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usuario">Usuário</SelectItem>
                    <SelectItem value="estabelecimento">Estabelecimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Emitente *</Label>
                <Select
                  value={form.issuerId}
                  onValueChange={(v) => setForm({ ...form, issuerId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {issuerList.length === 0 ? (
                      <SelectItem value="none" disabled>
                        Nenhum emitente cadastrado
                      </SelectItem>
                    ) : (
                      issuerList.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Receita recebida (opcional)</Label>
              <Select value={form.revenueId} onValueChange={selectRevenue}>
                <SelectTrigger>
                  <SelectValue placeholder="Vincular a uma receita" />
                </SelectTrigger>
                <SelectContent>
                  {revenues.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Nenhuma receita recebida
                    </SelectItem>
                  ) : (
                    revenues.map((revenue) => (
                      <SelectItem key={revenue.id} value={String(revenue.id)}>
                        #{revenue.id} — {revenue.payerName || revenue.description || "Receita"} —{" "}
                        {brl(revenue.amount)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="receiptPayer">Pagador *</Label>
                <Input
                  id="receiptPayer"
                  value={form.payerName}
                  onChange={(e) => setForm({ ...form, payerName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receiptAmount">Valor (R$) *</Label>
                <Input
                  id="receiptAmount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="receiptIssuedAt">Data de emissão</Label>
                <Input
                  id="receiptIssuedAt"
                  type="date"
                  value={form.issuedAt}
                  onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receiptDescription">Referente a</Label>
                <Input
                  id="receiptDescription"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Serviços prestados"
                />
              </div>
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
              Emitir recibo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Histórico */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Histórico do recibo</DialogTitle>
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
            <DialogTitle>Cancelar recibo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted">
              O recibo permanece no histórico com o status Cancelado. O motivo é obrigatório.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="receiptCancelReason">Motivo *</Label>
              <Input
                id="receiptCancelReason"
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
