/**
 * OllCLin — Mapa de rejeição fiscal (FISCAL.md §9, R23).
 *
 * Base — confirmar com o provedor antes de produção.
 * Sem resposta do órgão (timeout/conexão recusada) NÃO passa por aqui:
 * o worker trata como erro transitório retentável ANTES de consultar este mapa.
 */

import type { StatusNota } from "./tipos";

export interface EntradaRejeicao {
  /** Mensagem amigável para o painel (sem jargão do órgão). */
  mensagem: string;
  /** Status resultante na nota. */
  status: StatusNota;
  /** Pode reenviar com backoff? (rejeição de negócio nunca reteve — R24). */
  retentavel: boolean;
}

const AUTORIZADO: EntradaRejeicao = {
  mensagem: "Nota autorizada",
  status: "AUTORIZADA",
  retentavel: false,
};

const DENEGADO: EntradaRejeicao = {
  mensagem: "Nota denegada pelo órgão",
  status: "DENEGADA",
  retentavel: false,
};

const DUPLICIDADE: EntradaRejeicao = {
  mensagem:
    "Nota possivelmente já enviada — consultar situação antes de qualquer reenvio",
  status: "ERRO_TRANSITORIO",
  retentavel: false,
};

const ERRO_NAO_CATALOGADO: EntradaRejeicao = {
  mensagem: "Erro não catalogado — será tentado novamente",
  status: "ERRO_TRANSITORIO",
  retentavel: true,
};

const REJEICAO_NEGOCIO: EntradaRejeicao = {
  mensagem: "Nota rejeitada — corrija os dados e reemita",
  status: "REJEITADA",
  retentavel: false,
};

/** Mapa cStat → interpretação. Chaves confirmáveis com o provedor. */
export const CODIGOS_REJEICAO: Record<string, EntradaRejeicao> = {
  "100": AUTORIZADO,
  "101": {
    mensagem: "Cancelamento homologado",
    status: "CANCELADA",
    retentavel: false,
  },
  "110": DENEGADO,
  "301": DENEGADO,
  "302": DENEGADO,
  "204": DUPLICIDADE,
  "539": DUPLICIDADE,
  "999": ERRO_NAO_CATALOGADO,
};

/**
 * Resolve o cStat para a interpretação canônica. cStat desconhecido é
 * rejeição de negócio (definitivo) — NUNCA assumedo como transitório,
 * porque retentar rejeição real gera duplicidade legal.
 */
export function interpretarCStat(cStat: string | null | undefined): EntradaRejeicao {
  if (!cStat) return REJEICAO_NEGOCIO;
  return CODIGOS_REJEICAO[cStat] ?? REJEICAO_NEGOCIO;
}
