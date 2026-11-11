/**
 * OllCLin — STUB do adapter do provedor fiscal real (Etapa 5).
 *
 * ⚠️ ARQUIVO-STUB: não chama nenhum endpoint. Existe para:
 * 1. provar que a interface AdapterFiscal cabe no provedor real quando ele
 *    for escolhido (focus, enotas, plugnotas, nfeio, tecnospeed…);
 * 2. dar uma mensagem clara de configuração faltante em vez de crash.
 *
 * NÃO invente endpoints aqui (regra do projeto: sem API não confirmada).
 * Contratos que o provedor real PRECISA documentar antes da implementação:
 *   - emissor: campo por campo, incluindo NFS-e Padrão Nacional (DPS) se for
 *     o caso — o DF migrou para o padrão nacional; CONFIRMAR no comunicado
 *     oficial da Fazenda do DF e na doc do provedor antes de produção
 *     (o relatorio-integracao-fiscal-real.md mantém as fontes).
 *   - certificado: como o provedor recebe o A1 (upload/token) e se aceita A3.
 *   - idempotência: se aceita `ref` externa e o formato esperado.
 *   - webhook: formato, segredo e algoritmo de assinatura.
 *
 * Registrado como `provedor-real` em adapters/index.ts — só escolhido quando
 * o administrador configura explicitamente esse provedor.
 */

import type {
  AdapterFiscal,
  Credencial,
  NotaParaEmitir,
  RespostaConsulta,
  RespostaEmissao,
  RespostaEvento,
} from "../../../shared/fiscal/tipos";

export class ProvedorRealStubAdapter implements AdapterFiscal {
  private static MSG =
    "Provedor fiscal real não implementado: informe o provedor contratado e as credenciais nas variáveis de ambiente, ou emita em HOMOLOGACAO com o gateway-mock.";

  async emitir(_nota: NotaParaEmitir, _credencial: Credencial): Promise<RespostaEmissao> {
    throw new Error(ProvedorRealStubAdapter.MSG);
  }

  async consultar(_ref: string, _credencial: Credencial): Promise<RespostaConsulta> {
    throw new Error(ProvedorRealStubAdapter.MSG);
  }

  async cancelar(_ref: string, _motivo: string, _credencial: Credencial): Promise<RespostaEvento> {
    throw new Error(ProvedorRealStubAdapter.MSG);
  }

  async baixarPdf(_ref: string, _credencial: Credencial): Promise<Buffer> {
    throw new Error(ProvedorRealStubAdapter.MSG);
  }
}
