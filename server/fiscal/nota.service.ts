/**
 * OllCLin — Serviço do módulo fiscal (FISCAL.md §9/§11/§14).
 *
 * Regras implementadas:
 * - V2: nota só para agendamento concluído (status clínico "atendido");
 * - V3: snapshot congelado na gravação ENFILEIRADA;
 * - V4/V4.1: uma nota ativa por agendamento; segunda emissão sem
 *   `reemitir` retorna a existente (idempotente); reemissão é explícita;
 * - V5: cancelamento mantém vínculo e histórico;
 * - V6: lote com transação por item;
 * - V7: retroatividade respeita configuracoes_fiscais;
 * - R11: esta camada NUNCA chama órgão — só grava ENFILEIRADA e publica na fila.
 */

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  appointments,
  professionals,
} from "../../drizzle/schema";
import {
  configuracoesFiscais,
  eventosFiscais,
  filaFiscal,
  logsFiscais,
  notasFiscais,
  numeracaoFiscal,
  tomadoresFiscais,
  type NotaFiscal,
} from "../../drizzle/schema/fiscal";
import type {
  Ambiente,
} from "../../shared/fiscal/tipos";
import { interpretarCStat } from "../../shared/fiscal/codigos-rejeicao";

/* ------------------------------------------------------------------ */
/*  Preparar nota (§14 — pré-visualização, nunca envia)               */
/* ------------------------------------------------------------------ */

export interface BloqueioPreparo {
  campo: string;
  problema: string;
}

export interface PreparoNota {
  agendamentoId: number;
  bloqueios: BloqueioPreparo[];
  payload: {
    tomadorId: number | null;
    codigoServico: string;
    descricaoServico: string;
    valorServicos: string;
    aliquotaIss: string;
    dataCompetencia: Date | null;
    nomeMedico: string | null;
    crmMedico: string | null;
  } | null;
}

/**
 * Recalcula os valores a CADA chamada — `prepararNota` é só pré-visualização.
 * O snapshot de verdade acontece em emitirDoAgendamento (§11).
 */
export async function prepararNota(
  organizationId: number,
  agendamentoId: number,
): Promise<PreparoNota> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const bloqueios: BloqueioPreparo[] = [];

  const aptRows = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, agendamentoId), eq(appointments.organizationId, organizationId)))
    .limit(1);
  const agendamento = aptRows[0];
  if (!agendamento) throw new Error("Agendamento não encontrado");

  // V2 — só agendamento concluído ("atendido" é o status clínico de conclusão)
  if (agendamento.status !== "atendido") {
    bloqueios.push({ campo: "status", problema: "Agendamento não está concluído" });
  }

  // V7 — emissão retroativa
  const cfgRows = await db
    .select()
    .from(configuracoesFiscais)
    .where(
      and(
        eq(configuracoesFiscais.organizationId, organizationId),
        eq(configuracoesFiscais.ativo, true),
      ),
    )
    .limit(1);
  const config = cfgRows[0];
  if (!config) {
    bloqueios.push({ campo: "configuracao", problema: "Configuração fiscal ausente" });
  } else if (!config.permiteEmissaoRetroativa && agendamento.concluidoEm) {
    const dias = Math.floor((Date.now() - agendamento.concluidoEm.getTime()) / 86_400_000);
    if (dias > config.diasLimiteRetroativo) {
      bloqueios.push({
        campo: "competencia",
        problema: `Emissão retroativa além do limite de ${config.diasLimiteRetroativo} dia(s)`,
      });
    }
  }

  // Profissional sem CRM (§12, item 5)
  const profRows = await db
    .select()
    .from(professionals)
    .where(
      and(
        eq(professionals.id, agendamento.professionalId),
        eq(professionals.organizationId, organizationId),
      ),
    )
    .limit(1);
  const profissional = profRows[0];
  if (!profissional?.councilNumber) {
    bloqueios.push({
      campo: "crm",
      problema: "CRM do profissional não cadastrado",
    });
  }

  // Tomador vinculado
  if (!agendamento.fiscalTomadorId) {
    bloqueios.push({
      campo: "tomador",
      problema: "CPF/CNPJ do tomador não informado",
    });
  }

  const valor = agendamento.valorConsulta;
  if (!valor || Number(valor) <= 0) {
    bloqueios.push({ campo: "valor", problema: "Valor da consulta não informado" });
  }

  const aliquota = config?.aliquotaIssPadrao ?? "0";
  const valorNum = valor ? Number(valor) : 0;

  return {
    agendamentoId,
    bloqueios,
    payload:
      bloqueios.length === 0
        ? {
            tomadorId: agendamento.fiscalTomadorId ?? null,
            codigoServico: config?.itemListaServico ?? "",
            descricaoServico: agendamento.procedureId
              ? `Serviço de saúde #${agendamento.procedureId}`
              : "Serviço de saúde",
            valorServicos: valorNum.toFixed(2),
            aliquotaIss: String(aliquota),
            dataCompetencia: agendamento.concluidoEm ?? null, // concluidoEm = competência (§11)
            nomeMedico: profissional?.fullName ?? null,
            crmMedico: profissional?.councilNumber ?? null,
          }
        : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Emitir do agendamento (R11 — grava ENFILEIRADA e publica)         */
/* ------------------------------------------------------------------ */

export interface ResultadoEmissao {
  status: "CRIADA" | "EXISTENTE";
  nota: NotaFiscal;
  motivo?: string;
}

const STATUS_ATIVOS = [
  "RASCUNHO",
  "VALIDADA",
  "ENFILEIRADA",
  "ENVIANDO",
  "AUTORIZADA",
  "REJEITADA",
  "ERRO_TRANSITORIO",
  "DENEGADA",
  "EM_CONTINGENCIA",
] as const;

/**
 * Emissão individual. Toda a operação em UMA transação (V6 exige transação
 * por item; aqui é o item único).
 */
export async function emitirDoAgendamento(
  organizationId: number,
  agendamentoId: number,
  options: { reemitir?: boolean } = {},
): Promise<ResultadoEmissao> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transaction(async (tx) => {
    // Lock pessimista no agendamento — bloqueia corrida de clique duplo (V4)
    const aptRows = await tx
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, agendamentoId), eq(appointments.organizationId, organizationId)))
      .for("update")
      .limit(1);
    const agendamento = aptRows[0];
    if (!agendamento) throw new Error("Agendamento não encontrado");

    // V2 — só CONCLUIDO
    if (agendamento.status !== "atendido") {
      throw new Error("Só é possível emitir nota para agendamento concluído");
    }

    // Nota ativa existente?
    const existentes = await tx
      .select()
      .from(notasFiscais)
      .where(
        and(
          eq(notasFiscais.agendamentoId, agendamentoId),
          inArray(notasFiscais.status, [...STATUS_ATIVOS]),
        ),
      )
      .limit(1);
    const existente = existentes[0];

    if (existente) {
      // V4.1 — idempotente sem reemitir; reemissão é ação EXPLÍCITA
      if (!options.reemitir) {
        return { status: "EXISTENTE" as const, nota: existente };
      }
      // Reemissão: cancela a anterior (documento anterior vira SUBSTITUIDA)
      await tx
        .update(notasFiscais)
        .set({ status: "SUBSTITUIDA" })
        .where(eq(notasFiscais.id, existente.id));
    }

    // Config fiscal (dá série, numeração e alíquota)
    const cfgRows = await tx
      .select()
      .from(configuracoesFiscais)
      .where(
        and(
          eq(configuracoesFiscais.organizationId, organizationId),
          eq(configuracoesFiscais.ativo, true),
        ),
      )
      .limit(1);
    const config = cfgRows[0];
    if (!config) throw new Error("Configuração fiscal ausente para esta empresa");

    // V7 — retroatividade
    if (!config.permiteEmissaoRetroativa && agendamento.concluidoEm) {
      const dias = Math.floor((Date.now() - agendamento.concluidoEm.getTime()) / 86_400_000);
      if (dias > config.diasLimiteRetroativo) {
        throw new Error(
          `Emissão retroativa além do limite de ${config.diasLimiteRetroativo} dia(s) para este município`,
        );
      }
    }

    // Reserva atômica de número (SELECT ... FOR UPDATE — §6)
    const numRows = await tx
      .select()
      .from(numeracaoFiscal)
      .where(
        and(
          eq(numeracaoFiscal.organizationId, organizationId),
          eq(numeracaoFiscal.tipoDocumento, config.tipoDocumento),
          eq(numeracaoFiscal.ambiente, config.ambiente),
          eq(numeracaoFiscal.serie, config.serie),
        ),
      )
      .for("update")
      .limit(1);
    const numeracao = numRows[0];
    if (!numeracao) throw new Error("Numeração fiscal não inicializada para esta série");
    const numero = numeracao.ultimoNumero + 1;
    await tx
      .update(numeracaoFiscal)
      .set({ ultimoNumero: numero })
      .where(eq(numeracaoFiscal.id, numeracao.id));

    // Snapshot do tomador (V3)
    const tomRows = await tx
      .select()
      .from(tomadoresFiscais)
      .where(
        and(
          eq(tomadoresFiscais.id, agendamento.fiscalTomadorId ?? 0),
          eq(tomadoresFiscais.organizationId, organizationId),
        ),
      )
      .limit(1);
    const tomador = tomRows[0];
    if (!tomador) throw new Error("Tomador fiscal não encontrado para este agendamento");

    // Snapshot do profissional (V3)
    const profRows = await tx
      .select()
      .from(professionals)
      .where(and(eq(professionals.id, agendamento.professionalId), eq(professionals.organizationId, organizationId)))
      .limit(1);
    const profissional = profRows[0];
    if (!profissional?.councilNumber) {
      throw new Error("Profissional sem CRM cadastrado — complete o cadastro antes de emitir");
    }

    // Snapshot de VALORES no momento da emissão (§11 "Snapshot de valores")
    const aliquota = String(config.aliquotaIssPadrao);
    const valorServicos = Number(agendamento.valorConsulta ?? 0);
    if (valorServicos <= 0) throw new Error("Valor da consulta deve ser maior que zero");
    const valorIss = ((valorServicos * Number(aliquota)) / 100).toFixed(2);

    // Grava ENFILEIRADA (R11) — antes de publicar na fila (idempotência §7)
    const [nota] = await tx
      .insert(notasFiscais)
      .values({
        organizationId,
        tipoDocumento: config.tipoDocumento,
        ambiente: config.ambiente,
        serie: config.serie,
        numero,
        status: "ENFILEIRADA",
        agendamentoId,
        notaSubstituidaId: options.reemitir && existente ? existente.id : null,
        tomadorTipoPessoa: tomador.tipoPessoa,
        tomadorNome: tomador.nomeParaNota,
        tomadorCpfCnpj: tomador.cpfCnpj,
        tomadorEmail: tomador.email,
        tomadorCelular: tomador.celular,
        tomadorLogradouro: tomador.logradouro,
        tomadorNumero: tomador.numero,
        tomadorComplemento: tomador.complemento,
        tomadorBairro: tomador.bairro,
        tomadorCidade: tomador.cidade,
        tomadorUf: tomador.uf,
        tomadorCep: tomador.cep,
        nomeMedico: profissional.fullName,
        crmMedico: profissional.councilNumber,
        ufCrm: profissional.fiscalUfConselho,
        tipoConselho: profissional.fiscalTipoConselho,
        codigoServico: config.itemListaServico,
        descricaoServico: `Serviço de saúde #${agendamento.procedureId}`,
        dataCompetencia: agendamento.concluidoEm ?? new Date(),
        valorServicos: valorServicos.toFixed(2),
        valorIss,
        valorTotal: valorServicos.toFixed(2),
        aliquotaIss: aliquota,
        criadoPor: null,
        enfileiradoEm: new Date(),
      })
      .$returningId();

    const notaCompleta = { ...(await tx.select().from(notasFiscais).where(eq(notasFiscais.id, nota.id)).limit(1))[0] } as NotaFiscal;

    // Vincula no agendamento (V4): fiscal_nota_id aponta para a nota ATIVA
    await tx
      .update(appointments)
      .set({ fiscalStatus: "PENDENTE", fiscalNotaId: nota.id })
      .where(eq(appointments.id, agendamentoId));

    // Publica na fila por destino (R12)
    await tx.insert(filaFiscal).values({
      destino: `fila:fiscal:${config.tipoDocumento.toLowerCase()}:${config.provedor}`,
      notaId: nota.id,
      organizationId,
      operacao: "EMITIR",
    });

    return { status: "CRIADA" as const, nota: notaCompleta };
  });
}

/* ------------------------------------------------------------------ */
/*  Lote (V6 — transação por item, falha não aborta os demais)        */
/* ------------------------------------------------------------------ */

export interface ResultadoLoteItem {
  agendamentoId: number;
  ok: boolean;
  notaId?: number;
  motivo?: string;
}

export async function emitirLote(
  organizationId: number,
  agendamentoIds: number[],
  options: { reemitir?: boolean } = {},
): Promise<ResultadoLoteItem[]> {
  const resultados: ResultadoLoteItem[] = [];
  for (const agendamentoId of agendamentoIds) {
    try {
      const r = await emitirDoAgendamento(organizationId, agendamentoId, options);
      resultados.push({ agendamentoId, ok: true, notaId: r.nota.id });
    } catch (err) {
      resultados.push({
        agendamentoId,
        ok: false,
        motivo: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }
  return resultados;
}

/* ------------------------------------------------------------------ */
/*  Cancelamento (V5 — não reabre o agendamento)                      */
/* ------------------------------------------------------------------ */

export async function cancelarNota(
  organizationId: number,
  notaId: number,
  motivo: string,
): Promise<void> {
  if (motivo.trim().length < 15) {
    throw new Error("Motivo deve ter no mínimo 15 caracteres");
  }
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db
    .select()
    .from(notasFiscais)
    .where(and(eq(notasFiscais.id, notaId), eq(notasFiscais.organizationId, organizationId)))
    .limit(1);
  const nota = rows[0];
  if (!nota) throw new Error("Nota não encontrada");
  if (nota.status !== "AUTORIZADA") {
    throw new Error("Só notas AUTORIZADAs podem ser canceladas");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(notasFiscais)
      .set({ status: "CANCELADA" })
      .where(eq(notasFiscais.id, notaId));
    await tx.insert(eventosFiscais).values({
      notaId,
      organizationId,
      tipo: "CANCELAMENTO",
      sequencia: 1,
      motivo,
      status: "ENFILEIRADO",
    });
    await tx.insert(filaFiscal).values({
      destino: `fila:fiscal:eventos:${nota.ambiente.toLowerCase()}`,
      notaId,
      organizationId,
      operacao: "EVENTO",
    });
    // V5 — NÃO reabre o agendamento: statusNota → CANCELADA
    await tx
      .update(appointments)
      .set({ fiscalStatus: "CANCELADA" })
      .where(eq(appointments.id, nota.agendamentoId));
  });
}

/* ------------------------------------------------------------------ */
/*  Listagem (R02 — sempre por organizationId)                        */
/* ------------------------------------------------------------------ */

export async function listarNotas(
  organizationId: number,
  filtros: {
    ambiente?: Ambiente;
    status?: string[];
    profissionalId?: number;
    dataInicio?: Date;
    dataFim?: Date;
    pagina: number;
    porPagina: number;
  },
): Promise<{ itens: NotaFiscal[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const conds = [eq(notasFiscais.organizationId, organizationId)];
  if (filtros.ambiente) conds.push(eq(notasFiscais.ambiente, filtros.ambiente));
  if (filtros.status?.length) {
    conds.push(inArray(notasFiscais.status, filtros.status as NotaFiscal["status"][]));
  }
  if (filtros.dataInicio) conds.push(gte(notasFiscais.criadoEm, filtros.dataInicio));
  if (filtros.dataFim) conds.push(lte(notasFiscais.criadoEm, filtros.dataFim));

  const offset = (filtros.pagina - 1) * filtros.porPagina;
  const itens = await db
    .select()
    .from(notasFiscais)
    .where(and(...conds))
    .orderBy(desc(notasFiscais.criadoEm))
    .limit(filtros.porPagina)
    .offset(offset);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(notasFiscais)
    .where(and(...conds));
  return { itens, total: Number(total) };
}

/* ------------------------------------------------------------------ */
/*  Log fiscal (LGPD — mascara documento, sem XML, R25)               */
/* ------------------------------------------------------------------ */

export function mascararDocumento(doc: string | null | undefined): string {
  if (!doc) return "";
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `***.${d.slice(3, 6)}.***.${d.slice(9)}-${d.slice(-2)}`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.***/****-${d.slice(-2)}`;
  return "***";
}

export async function logFiscal(
  organizationId: number,
  notaId: number | null,
  adapter: string,
  operacao: string,
  dados: { requestResumo?: string; responseResumo?: string; cStat?: string | null; duracaoMs?: number; erro?: string },
): Promise<void> {
  const db = await getDb();
  if (!db) return; // log nunca derruba o fluxo fiscal
  await db.insert(logsFiscais).values({
    organizationId,
    notaId,
    adapter,
    operacao,
    requestResumo: dados.requestResumo?.slice(0, 500) ?? null,
    responseResumo: dados.responseResumo?.slice(0, 500) ?? null,
    cStat: dados.cStat ?? null,
    duracaoMs: dados.duracaoMs ?? null,
    erro: dados.erro?.slice(0, 500) ?? null,
  });
}

export { interpretarCStat };
