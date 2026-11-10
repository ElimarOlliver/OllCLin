/**
 * OllCLin — Tipos compartilhados do módulo fiscal (FISCAL.md §6)
 *
 * Contrato client + server. Enums FECHADOS: usar exatamente estes valores.
 * Qualquer divergência entre payload client/server quebra aqui, não em produção.
 */

import { z } from "zod";

/* ------------------------------- Enums ---------------------------------- */

export const TipoDocumento = {
  NFS_E: "NFS_E",
  NF_E: "NF_E",
  NFC_E: "NFC_E",
} as const;
export type TipoDocumento = (typeof TipoDocumento)[keyof typeof TipoDocumento];

export const Ambiente = {
  HOMOLOGACAO: "HOMOLOGACAO",
  PRODUCAO: "PRODUCAO",
} as const;
export type Ambiente = (typeof Ambiente)[keyof typeof Ambiente];

export const TipoCredencial = {
  A1: "A1",
  A3: "A3",
  TOKEN_GATEWAY: "TOKEN_GATEWAY",
} as const;
export type TipoCredencial = (typeof TipoCredencial)[keyof typeof TipoCredencial];

export const TipoEvento = {
  CANCELAMENTO: "CANCELAMENTO",
  CCE: "CCE",
  SUBSTITUICAO: "SUBSTITUICAO",
  MANIFESTACAO: "MANIFESTACAO",
  INUTILIZACAO: "INUTILIZACAO",
} as const;
export type TipoEvento = (typeof TipoEvento)[keyof typeof TipoEvento];

export const TipoPessoa = {
  FISICA: "FISICA",
  JURIDICA: "JURIDICA",
} as const;
export type TipoPessoa = (typeof TipoPessoa)[keyof typeof TipoPessoa];

/** Schema nativo do enum — evita import circular com schemas.ts no client. */
export const tipoPessoaSchema = z.enum(["FISICA", "JURIDICA"] as const);

export const FormaPagamento = {
  PIX: "PIX",
  DINHEIRO: "DINHEIRO",
  CARTAO_CREDITO: "CARTAO_CREDITO",
  CARTAO_DEBITO: "CARTAO_DEBITO",
  CONVENIO: "CONVENIO",
  OUTRO: "OUTRO",
} as const;
export type FormaPagamento = (typeof FormaPagamento)[keyof typeof FormaPagamento];

/**
 * Status da NOTA FISCAL (notas_fiscais.status).
 */
export const StatusNota = {
  RASCUNHO: "RASCUNHO",
  VALIDADA: "VALIDADA",
  ENFILEIRADA: "ENFILEIRADA",
  ENVIANDO: "ENVIANDO",
  AUTORIZADA: "AUTORIZADA",
  REJEITADA: "REJEITADA",
  ERRO_TRANSITORIO: "ERRO_TRANSITORIO",
  DENEGADA: "DENEGADA",
  CANCELADA: "CANCELADA",
  SUBSTITUIDA: "SUBSTITUIDA",
  EM_CONTINGENCIA: "EM_CONTINGENCIA",
} as const;
export type StatusNota = (typeof StatusNota)[keyof typeof StatusNota];

/**
 * Status FISCAL do agendamento (appointments.fiscal_status).
 *
 * Semântica (FISCAL.md §6):
 * - NAO_EMITIDA → default ao criar o agendamento.
 * - PENDENTE → setado quando o agendamento clínico fica concluído ("atendido").
 * - EMITIDA → nota autorizada. ERRO → nota rejeitada. CANCELADA → nota única ativa cancelada.
 *
 * IMPORTANTE: "atendido" é status CLÍNICO do agendamento; "PENDENTE" é o status
 * FISCAL dele. O painel de nota fiscal filtra por statusNota, NUNCA pelo clínico.
 */
export const StatusNotaAgendamento = {
  NAO_EMITIDA: "NAO_EMITIDA",
  PENDENTE: "PENDENTE",
  EMITIDA: "EMITIDA",
  CANCELADA: "CANCELADA",
  ERRO: "ERRO",
} as const;
export type StatusNotaAgendamento =
  (typeof StatusNotaAgendamento)[keyof typeof StatusNotaAgendamento];

/* ------------------------- Chaves naturais / idempotência ---------------- */

/**
 * Chave natural de idempotência (FISCAL.md §7):
 * empresaId + tipoDocumento + ambiente + serie + numero.
 */
export function chaveIdempotenciaFiscal(input: {
  empresaId: number;
  tipoDocumento: TipoDocumento;
  ambiente: Ambiente;
  serie: string;
  numero: number;
}): string {
  return [
    input.empresaId,
    input.tipoDocumento,
    input.ambiente,
    input.serie,
    input.numero,
  ].join(":");
}

/* --------------------------- Adapter (§8) -------------------------------- */

/**
 * Resposta normalizada de qualquer adapter. Código de erro do provedor
 * NUNCA vaza além daqui (R20).
 */
export interface RespostaFiscalBase {
  cStat: string | null;
  xMotivo: string | null;
}

export interface RespostaEmissao extends RespostaFiscalBase {
  status: StatusNota;
  chave?: string | null;
  protocolo?: string | null;
  xmlAutorizado?: string | null;
}

export interface RespostaConsulta extends RespostaFiscalBase {
  status: StatusNota;
  protocolo?: string | null;
}

export interface RespostaEvento extends RespostaFiscalBase {
  status: StatusNota;
  protocolo?: string | null;
}

/** Payload mínimo que todo adapter precisa saber emitir. */
export interface NotaParaEmitir {
  empresaId: number;
  tipoDocumento: TipoDocumento;
  ambiente: Ambiente;
  serie: string;
  numero: number;
  tomador: {
    tipoPessoa: TipoPessoa;
    cpfCnpj: string;
    nome: string;
    email?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cep?: string | null;
    codigoIbge?: string | null;
  };
  servico: {
    codigoServico: string;
    descricaoServico: string;
    dataCompetencia: string; // ISO
  };
  profissional?: {
    nome: string;
    crm?: string | null;
    ufCrm?: string | null;
    tipoConselho?: string | null;
  } | null;
  valores: {
    valorServicos: string; // decimal como string (precisão)
    valorIss: string;
    valorTotal: string;
    aliquotaIss: string;
  };
}

/** Credencial descriptografada — vive SÓ dentro do worker (R06). */
export interface Credencial {
  empresaId: number;
  tipo: TipoCredencial;
  /** A1: conteúdo do .pfx; TOKEN_GATEWAY: token do provedor. */
  material: string;
  senha?: string | null;
  validade?: Date | null;
}

/**
 * Interface única de comunicação com órgãos/provedores (R17).
 * O worker conhece apenas isto. Adicionar município = novo arquivo em adapters/.
 */
export interface AdapterFiscal {
  emitir(nota: NotaParaEmitir, credencial: Credencial): Promise<RespostaEmissao>;
  consultar(ref: string, credencial: Credencial): Promise<RespostaConsulta>;
  cancelar(ref: string, motivo: string, credencial: Credencial): Promise<RespostaEvento>;
  substituir?(
    ref: string,
    dados: NotaParaEmitir,
    credencial: Credencial,
  ): Promise<RespostaEmissao>;
  baixarPdf(ref: string, credencial: Credencial): Promise<Buffer>;
  manifestar?(
    ref: string,
    tipo: TipoEvento,
    credencial: Credencial,
  ): Promise<RespostaEvento>;
}
