/**
 * OllCLin — Schemas Zod do módulo fiscal (FISCAL.md §9, R21/R22).
 *
 * Validam o payload ANTES de enfileirar. Rodam no client (prévia) e no server
 * (fonte de verdade — nunca confiar no payload do front, mesmo em tRPC).
 *
 * Nota sobre dígito verificador: CPF/CNPJ validam DV aqui (regra R22);
 * a redundância deliberada — front E server — é a segunda barreira do §9.
 */

import { z } from "zod";
import { TipoDocumento, Ambiente, TipoPessoa, FormaPagamento } from "./tipos";

/* ------------------------- Validadores de documento ---------------------- */

function limparDocumento(v: string): string {
  return v.replace(/\D/g, "");
}

/** CPF: 11 dígitos + dígito verificador módulo 11. */
export function cpfValido(v: string): boolean {
  const cpf = limparDocumento(v);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (len: number): number => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(cpf[i]) * (len + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(cpf[9]) && dig(10) === Number(cpf[10]);
}

/** CNPJ: 14 dígitos + dígito verificador módulo 11 (pesos 5..2 e 6..2). */
export function cnpjValido(v: string): boolean {
  const cnpj = limparDocumento(v);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len: number): number => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(cnpj[i]) * pesos[i];
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

const documentoBase = z.string().trim().min(11).max(18);

/** Documento do TOMADOR: CPF (pessoa física) ou CNPJ (jurídica). */
export const documentoTomadorSchema = z.discriminatedUnion("tipoPessoa", [
  z.object({
    tipoPessoa: z.literal(TipoPessoa.FISICA),
    cpf: documentoBase.refine(cpfValido, { message: "CPF inválido" }),
  }),
  z.object({
    tipoPessoa: z.literal(TipoPessoa.JURIDICA),
    cnpj: documentoBase.refine(cnpjValido, { message: "CNPJ inválido" }),
  }),
]);

/* ------------------------------ Enum schemas ----------------------------- */

export const tipoDocumentoSchema = z.nativeEnum(TipoDocumento);
export const ambienteSchema = z.nativeEnum(Ambiente);
export const tipoPessoaSchema = z.nativeEnum(TipoPessoa);
export const formaPagamentoSchema = z.nativeEnum(FormaPagamento);

/* --------------------------- Tomador fiscal ------------------------------ */

export const tomadorFiscalSchema = z.object({
  id: z.number().int().positive().optional(),
  tipoPessoa: tipoPessoaSchema,
  cpfCnpj: documentoBase,
  nomeParaNota: z.string().trim().min(3).max(255),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  celular: z.string().trim().max(20).optional().or(z.literal("")),
  logradouro: z.string().trim().max(255).optional().or(z.literal("")),
  numero: z.string().trim().max(20).optional().or(z.literal("")),
  complemento: z.string().trim().max(255).optional().or(z.literal("")),
  bairro: z.string().trim().max(100).optional().or(z.literal("")),
  cidade: z.string().trim().max(100).optional().or(z.literal("")),
  uf: z.string().trim().length(2).optional().or(z.literal("")),
  cep: z.string().trim().max(9).optional().or(z.literal("")),
  codigoIbge: z.string().trim().regex(/^\d{7}$/, "Código IBGE deve ter 7 dígitos").optional().or(z.literal("")),
  inscricaoEstadual: z.string().trim().max(20).optional().or(z.literal("")),
});

export type TomadorFiscalInput = z.infer<typeof tomadorFiscalSchema>;

/* ------------------------ Configuração fiscal ---------------------------- */

export const configuracaoFiscalSchema = z.object({
  tipoDocumento: tipoDocumentoSchema,
  ambiente: ambienteSchema,
  provedor: z.string().trim().min(2).max(50),
  serie: z.string().trim().min(1).max(10),
  codigoMunicipio: z.string().trim().regex(/^\d{7}$/),
  itemListaServico: z.string().trim().min(1).max(10),
  aliquotaIssPadrao: z
    .number()
    .min(0)
    .max(100)
    .refine((v) => Number.isFinite(v), "Alíquota inválida"),
  regimeEspecialTributacao: z.number().int().min(0).max(9).optional(),
  permiteEmissaoRetroativa: z.boolean().default(false),
  diasLimiteRetroativo: z.number().int().min(0).max(365).default(0),
  ativo: z.boolean().default(true),
});

export type ConfiguracaoFiscalInput = z.infer<typeof configuracaoFiscalSchema>;

/* --------------------------- Empresa fiscal ------------------------------ */

export const empresaFiscalSchema = z.object({
  cnpj: documentoBase.refine(cnpjValido, { message: "CNPJ inválido" }),
  razaoSocial: z.string().trim().min(3).max(255),
  nomeFantasia: z.string().trim().max(255).optional().or(z.literal("")),
  ie: z.string().trim().max(20).optional().or(z.literal("")),
  im: z.string().trim().max(20).optional().or(z.literal("")),
  regimeTributario: z.string().trim().min(1).max(50),
  cnaePrincipal: z.string().trim().regex(/^\d{7}$/).optional().or(z.literal("")),
  enderecoCompleto: z.record(z.string(), z.unknown()).optional(),
  municipioIbge: z.string().trim().regex(/^\d{7}$/),
  uf: z.string().trim().length(2),
  emailFiscal: z.string().trim().email().max(320),
});

export type EmpresaFiscalInput = z.infer<typeof empresaFiscalSchema>;

/* ----------------------------- Emissão ----------------------------------- */

/** Payload de preparo/visualização — nunca envia nada (§14). */
export const prepararNotaSchema = z.object({
  agendamentoId: z.number().int().positive(),
});

/** Emissão individual. */
export const emitirDoAgendamentoSchema = z.object({
  agendamentoId: z.number().int().positive(),
  /** Reemissão é AÇÃO EXPLÍCITA (V4.1) — clique duplo não reemite. */
  reemitir: z.boolean().default(false),
  tomador: tomadorFiscalSchema.optional(),
});

/** Emissão em lote (V6): máximo 50, cada item transação própria. */
export const emitirLoteSchema = z.object({
  agendamentoIds: z
    .array(z.number().int().positive())
    .min(1, "Selecione ao menos um agendamento")
    .max(50, "Máximo de 50 agendamentos por lote"),
  reemitir: z.boolean().default(false),
});

export const cancelarNotaSchema = z.object({
  notaId: z.number().int().positive(),
  /** V5: motivo mínimo 15 caracteres. */
  motivo: z.string().trim().min(15, "Motivo deve ter no mínimo 15 caracteres").max(255),
});

export const listarNotasSchema = z.object({
  status: z.array(z.string()).optional(),
  ambiente: ambienteSchema.optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  profissionalId: z.number().int().positive().optional(),
  pagina: z.number().int().min(1).default(1),
  porPagina: z.number().int().min(1).max(100).default(20),
});

export const vincularTomadorSchema = z.object({
  agendamentoId: z.number().int().positive(),
  tomadorId: z.number().int().positive(),
});
