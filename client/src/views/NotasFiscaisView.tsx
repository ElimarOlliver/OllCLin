/**
 * OllCLin - View: Fiscal > Painel de Nota Fiscal (FISCAL.md §13)
 *
 * - Lista por status FISCAL (PENDENTE/EMITIDA/ERRO/CANCELADA) — nunca pelo
 *   status clínico do agendamento.
 * - Filtro obrigatório por ambiente, default PRODUCAO.
 * - Ação individual "Emitir nota" e lote (máx 50, checkbox).
 * - Botão mostra O QUE FALTA quando desabilitado (§12 item 5).
 * - Polling em statusNota/fiscalNotaId para status em tempo real.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, FileDown, Loader2, RefreshCw, Ban, FileText } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const LABEL_FISCAL: Record<string, string> = {
  NAO_EMITIDA: "Não emitida",
  PENDENTE: "Pendente",
  EMITIDA: "Emitida",
  CANCELADA: "Cancelada",
  ERRO: "Erro",
};

const COR_FISCAL: Record<string, string> = {
  NAO_EMITIDA: "bg-gray-100 text-gray-700",
  PENDENTE: "bg-blue-100 text-blue-700",
  EMITIDA: "bg-green-100 text-green-700",
  CANCELADA: "bg-yellow-100 text-yellow-700",
  ERRO: "bg-red-100 text-red-700",
};

const AMBIENTE_PADRAO = "PRODUCAO";

export default function NotasFiscaisView() {
  const [ambiente, setAmbiente] = useState<"HOMOLOGACAO" | "PRODUCAO">(AMBIENTE_PADRAO);
  // Consultas já atendidas entram inicialmente como NAO_EMITIDA.
  // PENDENTE é usado depois que a nota foi preparada/enfileirada.
  const [fiscalStatus, setFiscalStatus] = useState<string>("NAO_EMITIDA");
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [bloqueiosPor, setBloqueiosPor] = useState<Record<number, string[]>>({});

  // §13 — painel filtra por fiscalStatus, NUNCA pelo status clínico
  const painel = trpc.fiscal.painelAgendamentos.useQuery(
    {
      fiscalStatus: fiscalStatus as "PENDENTE" | "EMITIDA" | "ERRO" | "CANCELADA" | "NAO_EMITIDA",
      ambiente,
      porPagina: 50,
    },
    { refetchInterval: 10_000 }, // polling em tempo real
  );

  const utils = trpc.useUtils(); // usado no pré-carregamento dos bloqueios



  const emitir = trpc.fiscal.emitirDoAgendamento.useMutation({
    onSuccess: (r) => {
      if (r.status === "EXISTENTE") toast.info("Nota já existente para este agendamento.");
      else toast.success(`Nota nº ${r.numero} enfileirada para emissão.`);
      void painel.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const emitirLote = trpc.fiscal.emitirLote.useMutation({
    onSuccess: (r) => {
      const ok = r.itens.filter((i) => i.ok).length;
      toast.success(`${ok} de ${r.itens.length} notas enfileiradas.`);
      setSelecionados([]);
      void painel.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const cancelar = trpc.fiscal.cancelarNota.useMutation({
    onSuccess: () => {
      toast.success("Cancelamento enfileirado.");
      void painel.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Pré-visualiza o que falta para os agendamentos pendentes visíveis
  useEffect(() => {
    const pendentes = (painel.data?.itens ?? []).filter(
      (i) => i.fiscalStatus === "PENDENTE" || i.fiscalStatus === "NAO_EMITIDA",
    );
    for (const item of pendentes) {
      utils.fiscal.prepararNota
        .fetch({ agendamentoId: item.id })
        .then((res: { bloqueios: { problema: string }[] }) => {
          setBloqueiosPor((prev) => ({
            ...prev,
            [item.id]: res.bloqueios.map((b: { problema: string }) => b.problema),
          }));
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painel.data?.itens]);

  const itens = useMemo(() => painel.data?.itens ?? [], [painel.data]);

  const toggle = useCallback((id: number) => {
    setSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 50),
    );
  }, []);

  const emitirLoteHandler = () => {
    if (selecionados.length === 0) return;
    emitirLote.mutate({ agendamentoIds: selecionados });
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Painel de Nota Fiscal</h1>
        <Button variant="outline" size="sm" onClick={() => void painel.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Filtros — ambiente OBRIGATÓRIO, default PRODUCAO */}
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Label>Ambiente</Label>
          <Select value={ambiente} onValueChange={(v) => setAmbiente(v as typeof ambiente)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRODUCAO">Produção</SelectItem>
              <SelectItem value="HOMOLOGACAO">Homologação</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label>Status fiscal</Label>
          <Select value={fiscalStatus} onValueChange={setFiscalStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(LABEL_FISCAL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selecionados.length > 0 && (
          <div className="flex items-end">
            <Button onClick={emitirLoteHandler} disabled={emitirLote.isPending}>
              {emitirLote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Emitir lote ({selecionados.length}/50)
            </Button>
          </div>
        )}
      </div>

      {ambiente === "HOMOLOGACAO" && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          Você está vendo notas de HOMOLOGAÇÃO — não representam documentos válidos.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Consulta</TableHead>
              <TableHead>Profissional</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bloqueios</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {painel.isLoading && (
              <TableRow><TableCell colSpan={7}><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            )}
            {!painel.isLoading && itens.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum agendamento neste filtro.</TableCell></TableRow>
            )}
            {itens.map((item) => {
              const bloqueios = bloqueiosPor[item.id] ?? [];
              const podeEmitir =
                (item.fiscalStatus === "PENDENTE" || item.fiscalStatus === "NAO_EMITIDA") &&
                bloqueios.length === 0;
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox checked={selecionados.includes(item.id)} onCheckedChange={() => toggle(item.id)} />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{item.startsAt ? new Date(item.startsAt).toLocaleDateString("pt-BR") : "—"}</div>
                    <div className="text-xs text-muted-foreground">#{item.id}</div>
                  </TableCell>
                  <TableCell>
                    <div>{item.profissionalNome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{item.profissionalCrm ?? "CRM não cadastrado"}</div>
                  </TableCell>
                  <TableCell>
                    {item.valorConsulta ? Number(item.valorConsulta).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={COR_FISCAL[item.fiscalStatus] ?? ""}>
                      {LABEL_FISCAL[item.fiscalStatus] ?? item.fiscalStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-red-600">
                    {bloqueios.length > 0 ? (
                      <span className="inline-flex items-start gap-1">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {bloqueios.join("; ")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        disabled={!podeEmitir || emitir.isPending}
                        onClick={() => emitir.mutate({ agendamentoId: item.id })}
                        title={bloqueios.length > 0 ? bloqueios.join("; ") : "Emitir nota"}
                      >
                        {emitir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gerar nota"}
                      </Button>
                      {item.fiscalNotaId && item.fiscalStatus === "EMITIDA" && (
                        <>
                          <Button size="sm" variant="outline" title="Baixar XML"
                            onClick={() => window.open(`/api/fiscal/${item.fiscalNotaId}/xml`, "_blank")}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" title="Cancelar"
                            onClick={() => {
                              const motivo = window.prompt("Motivo do cancelamento (mínimo 15 caracteres):");
                              if (motivo && motivo.trim().length >= 15 && item.fiscalNotaId) {
                                cancelar.mutate({ notaId: item.fiscalNotaId, motivo });
                              } else if (motivo !== null) {
                                toast.error("Motivo deve ter no mínimo 15 caracteres.");
                              }
                            }}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Emissão assíncrona: a nota é enfileirada e autorizada em segundos/minutos. Use "Atualizar" para ver o status.
      </p>
    </div>
  );
}
