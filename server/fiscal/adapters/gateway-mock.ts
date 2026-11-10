/**
 * OllCLin — Adapter fiscal MOCK (FISCAL.md §8).
 *
 * Provedor simulado para HOMOLOGAÇÃO e para a suíte de testes. Permite
 * exercitar TODO o fluxo (fila, worker, rejeição, cancelamento) sem tocar
 * em órgão real. Substituir por gateway-*.ts quando o provedor for escolhido
 * (pendência 2 do FISCAL.md) — nenhum outro arquivo muda (R19).
 *
 * Comportamento configurável por variável de ambiente:
 *   FISCAL_MOCK_CSTAT — cStat simulado na emissão (default 100).
 */

import type {
  AdapterFiscal,
  Credencial,
  NotaParaEmitir,
  RespostaConsulta,
  RespostaEmissao,
  RespostaEvento,
  TipoEvento,
} from "../../../shared/fiscal/tipos";

const TIMEOUT_MS = 60_000; // R16: mínimo 60s

function comTimeout<T>(p: Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => {
        ctrl.abort();
        reject(new Error("Timeout do adapter fiscal"));
      }, TIMEOUT_MS);
      p.finally(() => clearTimeout(t));
    }),
  ]);
}

export class GatewayMockAdapter implements AdapterFiscal {
  async emitir(nota: NotaParaEmitir, _credencial: Credencial): Promise<RespostaEmissao> {
    return comTimeout(
      (async () => {
        const cStat = process.env.FISCAL_MOCK_CSTAT ?? "100";
        const autorizado = cStat === "100";
        return {
          status: autorizado ? ("AUTORIZADA" as const) : ("REJEITADA" as const),
          cStat,
          xMotivo: autorizado
            ? "Autorizado (mock)"
            : `Rejeitado (mock): cStat ${cStat}`,
          chave: autorizado ? `MOCK${Date.now()}${nota.numero}` : null,
          protocolo: autorizado ? `MOCK-PROTO-${nota.numero}` : null,
          xmlAutorizado: autorizado
            ? `<nota numero="${nota.numero}"><mock/></nota>`
            : null,
        };
      })(),
    );
  }

  async consultar(ref: string, _credencial: Credencial): Promise<RespostaConsulta> {
    return comTimeout(
      Promise.resolve({
        status: "AUTORIZADA" as const,
        cStat: "100",
        xMotivo: "Autorizado (mock)",
        protocolo: `MOCK-PROTO-${ref}`,
      }),
    );
  }

  async cancelar(ref: string, motivo: string, _credencial: Credencial): Promise<RespostaEvento> {
    return comTimeout(
      Promise.resolve({
        status: "CANCELADA" as const,
        cStat: "101",
        xMotivo: `Cancelamento homologado (mock): ${motivo.slice(0, 50)}`,
        protocolo: `MOCK-CANC-${ref}`,
      }),
    );
  }

  async baixarPdf(ref: string, _credencial: Credencial): Promise<Buffer> {
    return comTimeout(Promise.resolve(Buffer.from(`PDF mock da nota ${ref}`, "utf8")));
  }

  async manifestar(
    ref: string,
    tipo: TipoEvento,
    _credencial: Credencial,
  ): Promise<RespostaEvento> {
    return comTimeout(
      Promise.resolve({
        status: "AUTORIZADA" as const,
        cStat: "100",
        xMotivo: `${tipo} homologado (mock)`,
        protocolo: `MOCK-MANIF-${ref}`,
      }),
    );
  }
}
