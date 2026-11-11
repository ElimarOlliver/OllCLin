/**
 * OllCLin — Factory de adapters fiscais (FISCAL.md §8, R18).
 *
 * Lê configuracoes_fiscais.provedor e resolve o adapter. A credencial é
 * injetada APENAS naquele instante (R18) — nunca cacheada aqui.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { configuracoesFiscais } from "../../../drizzle/schema/fiscal";
import type {
  AdapterFiscal,
  Ambiente,
  TipoDocumento,
} from "../../../shared/fiscal/tipos";
import { GatewayMockAdapter } from "./gateway-mock";
import { ProvedorRealStubAdapter } from "./gateway-provedor-real";

const REGISTRO: Record<string, () => AdapterFiscal> = {
  mock: () => new GatewayMockAdapter(),
  /** Etapa 5: stub documentado — lança erro claro até o provedor real ser escolhido. */
  "provedor-real": () => new ProvedorRealStubAdapter(),
  // TODO: confirmar contrato com o provedor (pendência 2 do FISCAL.md) antes
  // de registrar gateways reais: focus, enotas, plugnotas, nfeio, tecnospeed.
};

/**
 * Resolve o adapter para a empresa + tipoDocumento + ambiente.
 * Erro de configuração vira exceção de domínio — código de provedor não vaza (R20).
 */
export async function getAdapter(
  organizationId: number,
  tipoDocumento: TipoDocumento,
  ambiente: Ambiente,
): Promise<AdapterFiscal> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db
    .select()
    .from(configuracoesFiscais)
    .where(
      and(
        eq(configuracoesFiscais.organizationId, organizationId),
        eq(configuracoesFiscais.tipoDocumento, tipoDocumento),
        eq(configuracoesFiscais.ambiente, ambiente),
        eq(configuracoesFiscais.ativo, true),
      ),
    )
    .limit(1);

  const config = rows[0];
  if (!config) {
    throw new Error(
      `Configuração fiscal ausente para ${tipoDocumento}/${ambiente}. Complete o onboarding fiscal da empresa.`,
    );
  }

  const factory = REGISTRO[config.provedor];
  if (!factory) {
    throw new Error(`Provedor fiscal "${config.provedor}" não registrado`);
  }
  return factory();
}

/** Nome do destino da fila (R12): fila:fiscal:nfse:{provedor}. */
export function destinoFila(
  tipoDocumento: TipoDocumento,
  provedor: string,
): string {
  return `fila:fiscal:${tipoDocumento.toLowerCase()}:${provedor}`;
}
