/**
 * OllCLin — Etapa 3: confirmação e validação do lote de NFS-e.
 *
 * - Dados FIXOS vêm da config_fiscal (backend); dados VARIÁVEIS da consulta.
 * - Valor e forma de pagamento aparecem sugeridos, mas exigem confirmação
 *   explícita (checkbox "Confirmo os valores").
 * - Itens com dados inválidos ficam BLOQUEADOS com o motivo visível, sem
 *   impedir a emissão dos demais.
 * - Correção individual: valor e forma de pagamento editáveis antes do envio.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormaPagamento } from "@shared/fiscal/tipos";

export interface ItemConfirmacao {
  agendamentoId: number;
  paciente: string;
  tomadorDocumento: string;
  valorConsulta: string; // decimal como string
  formaPagamento: string | null;
  dataCompetencia: string | null;
  profissional: string | null;
  crm: string | null;
  convenio: string | null;
  desconto: string | null;
  observacoes: string | null;
  /** Bloqueios vindos de prepararNota — item bloqueado NÃO impede os demais. */
  bloqueios: string[];
}

interface Props {
  open: boolean;
  ambiente: "HOMOLOGACAO" | "PRODUCAO";
  itens: ItemConfirmacao[];
  lotePendente: boolean;
  onClose: () => void;
  onConfirmar: (
    itens: { agendamentoId: number; valor: string; formaPagamento: string }[],
  ) => void;
}

const FORMAS = Object.values(FormaPagamento) as string[];
const LABEL_FORMA: Record<string, string> = {
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  CONVENIO: "Convênio",
  OUTRO: "Outro",
};

export default function ConfirmacaoLote({ open, ambiente, itens, lotePendente, onClose, onConfirmar }: Props) {
  // Edição local dos valores/forma de pagamento por item.
  const [edicoes, setEdicoes] = useState<Record<number, { valor: string; forma: string }>>({});
  const [confirmadoValores, setConfirmadoValores] = useState(false);

  const itensProcessados = useMemo(
    () =>
      itens.map((i) => {
        const ed = edicoes[i.agendamentoId];
        const valor = ed?.valor ?? i.valorConsulta;
        const forma = ed?.forma ?? i.formaPagamento ?? "";
        const bloqueios = [...i.bloqueios];
        const v = Number(valor);
        if (!(v > 0)) bloqueios.push("Valor zerado ou inválido");
        if (!FORMAS.includes(forma)) bloqueios.push("Forma de pagamento não confirmada");
        return { ...i, valor, forma, bloqueios };
      }),
    [itens, edicoes],
  );

  const liberados = itensProcessados.filter((i) => i.bloqueios.length === 0);
  const bloqueados = itensProcessados.filter((i) => i.bloqueios.length > 0);

  const confirmar = () => {
    if (!confirmadoValores) {
      toast.error("Confirme os valores e formas de pagamento antes de emitir.");
      return;
    }
    if (liberados.length === 0) {
      toast.error("Nenhum item válido para emitir.");
      return;
    }
    onConfirmar(
      liberados.map((i) => ({ agendamentoId: i.agendamentoId, valor: i.valor, formaPagamento: i.forma })),
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar emissão de notas fiscais</DialogTitle>
        </DialogHeader>

        <div
          className={`rounded-md border p-3 text-sm ${ambiente === "PRODUCAO"
              ? "border-red-300 bg-red-50 text-red-800"
              : "border-yellow-300 bg-yellow-50 text-yellow-800"
            }`}
        >
          Ambiente ativo: <strong>{ambiente === "PRODUCAO" ? "PRODUÇÃO" : "HOMOLOGAÇÃO"}</strong>
          {ambiente === "HOMOLOGACAO" && " — notas de teste, sem valor legal."}
          {ambiente === "PRODUCAO" && " — notas válidas perante a prefeitura."}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">Paciente</th>
                <th className="p-2 text-left">Documento</th>
                <th className="p-2 text-left">Valor</th>
                <th className="p-2 text-left">Forma de pagamento</th>
                <th className="p-2 text-left">Profissional</th>
                <th className="p-2 text-left">Bloqueios</th>
              </tr>
            </thead>
            <tbody>
              {itensProcessados.map((i) => (
                <tr key={i.agendamentoId} className={i.bloqueios.length > 0 ? "opacity-60" : ""}>
                  <td className="p-2">{i.paciente}</td>
                  <td className="p-2 font-mono text-xs">{i.tomadorDocumento}</td>
                  <td className="p-2">
                    <Input
                      className="h-8 w-28"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={i.valor}
                      disabled={i.bloqueios.some((b) => b.startsWith("Tomador") || b.startsWith("CPF"))}
                      onChange={(e) =>
                        setEdicoes((prev) => ({
                          ...prev,
                          [i.agendamentoId]: { valor: e.target.value, forma: i.forma },
                        }))
                      }
                    />
                  </td>
                  <td className="p-2">
                    <Select
                      value={i.forma || undefined}
                      onValueChange={(v) =>
                        setEdicoes((prev) => ({
                          ...prev,
                          [i.agendamentoId]: { valor: i.valor, forma: v },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {FORMAS.map((f) => (
                          <SelectItem key={f} value={f}>{LABEL_FORMA[f] ?? f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 text-xs">
                    {i.profissional ?? "—"}
                    {i.crm ? ` (${i.crm})` : ""}
                  </td>
                  <td className="p-2 text-xs text-red-600">
                    {i.bloqueios.length > 0 ? (
                      <span className="inline-flex items-start gap-1">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {i.bloqueios.join("; ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          {liberados.length} nota(s) prontas · {bloqueados.length} bloqueada(s) — as bloqueadas não impedem as demais.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={confirmadoValores} onCheckedChange={(v) => setConfirmadoValores(v === true)} />
          Confirmo os valores, formas de pagamento e dados do emissor acima.
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={lotePendente || liberados.length === 0}>
            {lotePendente ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Emitir {liberados.length} nota(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
