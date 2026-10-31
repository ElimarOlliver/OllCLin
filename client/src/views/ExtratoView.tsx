/**
 * OllCLin - View: Financeiro > Extrato
 * Arquitetura MVC - Camada Visão
 *
 * Requisitos (briefing Cap. 15.4):
 * - Extrato derivado de receitas, vendas, despesas e repasses
 * - Filtros por período, tipo (entrada/saída) e origem
 * - Balanço do período (entradas - saídas)
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Scale,
  Download,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const ORGANIZATION_ID = 1;

type StatementEntry = {
  id: string;
  referenceId: number;
  type: "entrada" | "saida";
  source: "receita" | "venda" | "despesa" | "repasse";
  date: string | null;
  description: string;
  counterpart: string | null;
  amount: number;
};

const SOURCE_LABEL: Record<string, string> = {
  receita: "Receita",
  venda: "Venda",
  despesa: "Despesa",
  repasse: "Repasse",
};

const SOURCE_STYLE: Record<string, string> = {
  receita: "bg-emerald-100 text-emerald-700",
  venda: "bg-blue-100 text-blue-700",
  despesa: "bg-red-100 text-red-700",
  repasse: "bg-purple-100 text-purple-700",
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

export default function ExtratoView() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(isoDate(new Date()));
  const [type, setType] = useState("todos");
  const [source, setSource] = useState("todas");

  const { data, isLoading, error } = trpc.extrato.list.useQuery({
    organizationId: ORGANIZATION_ID,
    from: from || undefined,
    to: to || undefined,
    type: type === "todos" ? undefined : (type as "entrada" | "saida"),
    source:
      source === "todas"
        ? undefined
        : (source as "receita" | "venda" | "despesa" | "repasse"),
    limit: 500,
  });

  const entries = (data?.entries ?? []) as StatementEntry[];
  const summary = data?.summary ?? { entriesTotal: 0, exitsTotal: 0, balance: 0 };

  function exportCsv() {
    if (entries.length === 0) return;
    const header = ["Data", "Tipo", "Origem", "Descrição", "Contraparte", "Valor"];
    const rows = entries.map((entry) => [
      entry.date ?? "",
      entry.type,
      SOURCE_LABEL[entry.source] ?? entry.source,
      entry.description.replace(/;/g, ","),
      (entry.counterpart ?? "").replace(/;/g, ","),
      entry.amount.toFixed(2).replace(".", ","),
    ]);
    const csv = [header, ...rows].map((row) => row.join(";")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `extrato-${from}-a-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-2 space-y-4">
      <div className="bg-white rounded-lg border border-line shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Extrato
            </h1>
            <p className="text-muted text-sm mt-1">
              Entradas e saídas do período, reunindo receitas, vendas, despesas e repasses.
            </p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={entries.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="grid gap-2">
            <Label htmlFor="statementFrom">De</Label>
            <Input
              id="statementFrom"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="statementTo">Até</Label>
            <Input
              id="statementTo"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Origem</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="receita">Receitas</SelectItem>
                <SelectItem value="venda">Vendas</SelectItem>
                <SelectItem value="despesa">Despesas</SelectItem>
                <SelectItem value="repasse">Repasses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <ArrowUpCircle className="h-4 w-4" />
              <span className="text-sm">Entradas</span>
            </div>
            <p className="text-xl font-bold text-emerald-800 mt-1">{brl(summary.entriesTotal)}</p>
          </div>
          <div className="rounded-lg bg-red-50 px-4 py-3">
            <div className="flex items-center gap-2 text-red-700">
              <ArrowDownCircle className="h-4 w-4" />
              <span className="text-sm">Saídas</span>
            </div>
            <p className="text-xl font-bold text-red-800 mt-1">{brl(summary.exitsTotal)}</p>
          </div>
          <div className={`rounded-lg px-4 py-3 ${summary.balance >= 0 ? "bg-blue-50" : "bg-amber-50"}`}>
            <div className="flex items-center gap-2 text-foreground/80">
              <Scale className="h-4 w-4" />
              <span className="text-sm">Saldo do período</span>
            </div>
            <p
              className={`text-xl font-bold mt-1 ${
                summary.balance >= 0 ? "text-blue-800" : "text-amber-800"
              }`}
            >
              {brl(summary.balance)}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando extrato...
          </div>
        ) : error ? (
          <p className="text-red-600 text-sm py-8 text-center">
            Não foi possível gerar o extrato. Verifique se a migração 0003 já foi aplicada.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            Nenhum lançamento no período selecionado.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Contraparte</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">{entry.date ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          entry.type === "entrada" ? "text-emerald-700" : "text-red-600"
                        }`}
                      >
                        {entry.type === "entrada" ? (
                          <ArrowUpCircle className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownCircle className="h-3.5 w-3.5" />
                        )}
                        {entry.type === "entrada" ? "Entrada" : "Saída"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={SOURCE_STYLE[entry.source] ?? "bg-gray-100"}>
                        {SOURCE_LABEL[entry.source] ?? entry.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{entry.description}</TableCell>
                    <TableCell className="text-sm">{entry.counterpart ?? "—"}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        entry.type === "entrada" ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {entry.type === "entrada" ? "+" : "−"} {brl(entry.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
