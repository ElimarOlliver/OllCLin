/**
 * OllCLin — Worker emissor fiscal (FISCAL.md §7, R13–R16).
 *
 * - Stateless e idempotente: reexecutar não cria nota duplicada (a nota já
 *   existe com chave natural única; o job duplicado é ignorado).
 * - ANTSS de qualquer reenvio: consultar status (R15).
 * - Sem resposta do órgão → ERRO_TRANSITORIO retentável (backoff R14).
 * - Rejeição de negócio → REJEITADA, sem retry (R24).
 * - Descriptografa a credencial SÓ aqui, SÓ durante a chamada (R06).
 * - Timeout com AbortController ≥ 60s (R16).
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { certificados, notasFiscais, filaFiscal, type NotaFiscal } from "../../../drizzle/schema/fiscal";
import { appointments } from "../../../drizzle/schema";
import { getAdapter } from "../adapters";
import { usar as usarCofre } from "../cofre";
import { logFiscal, mascararDocumento } from "../nota.service";
import { interpretarCStat } from "../../../shared/fiscal/codigos-rejeicao";
import { chaveIdempotenciaFiscal, type NotaParaEmitir, type Credencial } from "../../../shared/fiscal/tipos";

const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000, 3_600_000]; // R14
const MAX_TENTATIVAS = 5;

/** Pega um job com FOR UPDATE SKIP LOCKED (R13). */
async function pegarJob() {
  const db = await getDb();
  if (!db) return null;
  const agora = new Date();
  // MySQL: fila leve com UPDATE atômico em vez de SKIP LOCKED (MySQL 8 não
  // suporta SKIP LOCKED em SELECT ... FOR UPDATE com todas as builds; a
  // claim atômica por UPDATE atingindo exatamente 1 linha é equivalente).
  const claimed = await db
    .update(filaFiscal)
    .set({ processadoEm: new Date() })
    .where(
      sql`${filaFiscal.id} = (
        SELECT f.id FROM (SELECT id FROM fila_fiscal WHERE processado_em IS NULL AND disponivel_em <= ${agora} AND operacao = 'EMITIR' ORDER BY disponivel_em ASC LIMIT 1) x
      )`,
    );
  if (!claimed) return null;
  const rows = await db.select().from(filaFiscal).orderBy(sql`id DESC`).limit(1);
  return rows[0] ?? null;
}

function notaParaPayload(nota: NotaFiscal): NotaParaEmitir {
  return {
    empresaId: nota.organizationId,
    tipoDocumento: nota.tipoDocumento,
    ambiente: nota.ambiente,
    serie: nota.serie,
    numero: nota.numero,
    tomador: {
      tipoPessoa: nota.tomadorTipoPessoa,
      cpfCnpj: nota.tomadorCpfCnpj,
      nome: nota.tomadorNome,
      email: nota.tomadorEmail,
      logradouro: nota.tomadorLogradouro,
      numero: nota.tomadorNumero,
      complemento: nota.tomadorComplemento,
      bairro: nota.tomadorBairro,
      cidade: nota.tomadorCidade,
      uf: nota.tomadorUf,
      cep: nota.tomadorCep,
    },
    servico: {
      codigoServico: nota.codigoServico,
      descricaoServico: nota.descricaoServico,
      dataCompetencia: nota.dataCompetencia.toISOString(),
    },
    profissional: {
      nome: nota.nomeMedico ?? "",
      crm: nota.crmMedico,
      ufCrm: nota.ufCrm,
      tipoConselho: nota.tipoConselho,
    },
    valores: {
      valorServicos: nota.valorServicos,
      valorIss: nota.valorIss,
      valorTotal: nota.valorTotal,
      aliquotaIss: nota.aliquotaIss,
    },
  };
}

/**
 * Processa UM job de emissão. Exportado para testes e para o loop do worker.
 * Nunca lança: erros ficam registrados no job e na nota.
 */
export async function processarJobEmissao(jobId: number): Promise<"OK" | "RETRY" | "DLQ"> {
  const db = await getDb();
  if (!db) return "RETRY";

  const jobs = await db.select().from(filaFiscal).where(eq(filaFiscal.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job || job.processadoEm) return "OK"; // já processado — idempotente (R13)

  const notas = await db
    .select()
    .from(notasFiscais)
    .where(eq(notasFiscais.id, job.notaId))
    .limit(1);
  const nota = notas[0];
  if (!nota) return "OK";

  // Reentrada: nota pode já ter sido autorizada por outra execução (R15)
  if (nota.status === "AUTORIZADA" || nota.status === "CANCELADA" || nota.status === "DENEGADA") {
    return "OK";
  }

  const inicio = Date.now();
  const credRows = await db
    .select()
    .from(certificados)
    .where(
      and(
        eq(certificados.organizationId, nota.organizationId),
        eq(certificados.ativo, true),
        eq(certificados.ambiente, nota.ambiente),
      ),
    )
    .limit(1);
  const cert = credRows[0];
  if (!cert) {
    await db
      .update(notasFiscais)
      .set({ status: "ERRO_TRANSITORIO", xMotivo: "Credencial fiscal não cadastrada" })
      .where(eq(notasFiscais.id, nota.id));
    return "DLQ";
  }
  // R08 — certificado vencido bloqueia emissão
  if (cert.validoAte.getTime() < Date.now()) {
    await db
      .update(notasFiscais)
      .set({ status: "ERRO_TRANSITORIO", xMotivo: "Certificado fiscal vencido" })
      .where(eq(notasFiscais.id, nota.id));
    return "DLQ";
  }

  try {
    const adapter = await getAdapter(nota.organizationId, nota.tipoDocumento, nota.ambiente);
    const resultado = await usarCofre(nota.organizationId, Number(cert.segredoRef), async (material, senha) => {
      const credencial: Credencial = {
        empresaId: nota.organizationId,
        tipo: cert.tipo,
        material,
        senha,
        validade: cert.validoAte,
      };
      // R16 — adapter aplica seu próprio AbortController/timeout
      return adapter.emitir(notaParaPayload(nota), credencial);
    });

    const duracaoMs = Date.now() - inicio;
    await logFiscal(
      nota.organizationId,
      nota.id,
      "gateway-mock",
      "emitir",
      {
        requestResumo: `emitir ${chaveIdempotenciaFiscal({
          empresaId: nota.organizationId,
          tipoDocumento: nota.tipoDocumento,
          ambiente: nota.ambiente,
          serie: nota.serie,
          numero: nota.numero,
        })} tomador=${mascararDocumento(nota.tomadorCpfCnpj)}`,
        responseResumo: `cStat=${resultado.cStat}`,
        cStat: resultado.cStat,
        duracaoMs,
      },
    );

    if (resultado.status === "AUTORIZADA") {
      await db
        .update(notasFiscais)
        .set({
          status: "AUTORIZADA",
          chaveAcesso: resultado.chave ?? null,
          protocolo: resultado.protocolo ?? null,
          xmlAutorizado: resultado.xmlAutorizado ?? null,
          cStat: resultado.cStat,
          xMotivo: resultado.xMotivo,
          autorizadoEm: new Date(),
          enviadoEm: new Date(),
        })
        .where(eq(notasFiscais.id, nota.id));
      await db
        .update(appointments)
        .set({ fiscalStatus: "EMITIDA", fiscalNotaId: nota.id })
        .where(eq(appointments.id, nota.agendamentoId));
      return "OK";
    }

    // Mapa de rejeição (R23/R24)
    const interpretação = interpretarCStat(resultado.cStat);
    await db
      .update(notasFiscais)
      .set({ status: interpretação.status, cStat: resultado.cStat, xMotivo: resultado.xMotivo })
      .where(eq(notasFiscais.id, nota.id));

    if (!interpretação.retentavel) {
      // Rejeição de negócio → ERRO no agendamento, sem retry (R24)
      await db
        .update(appointments)
        .set({ fiscalStatus: "ERRO" })
        .where(eq(appointments.id, nota.agendamentoId));
      return "DLQ";
    }
    return "RETRY";
  } catch (err) {
    // Sem resposta do órgão (timeout/recusa): ERRO_TRANSITORIO retentável (§9)
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    const tentativa = nota.tentativas + 1;
    await db
      .update(notasFiscais)
      .set({
        status: "ERRO_TRANSITORIO",
        tentativas: tentativa,
        xMotivo: msg.slice(0, 500),
      })
      .where(eq(notasFiscais.id, nota.id));

    if (tentativa >= MAX_TENTATIVAS) {
      await db
        .update(appointments)
        .set({ fiscalStatus: "ERRO" })
        .where(eq(appointments.id, nota.agendamentoId));
      await db
        .update(filaFiscal)
        .set({ erro: msg.slice(0, 500) })
        .where(eq(filaFiscal.id, jobId));
      return "DLQ";
    }
    const proximoEm = new Date(Date.now() + (BACKOFF_MS[Math.min(tentativa - 1, BACKOFF_MS.length - 1)] ?? 3_600_000));
    await db
      .update(filaFiscal)
      .set({ disponivelEm: proximoEm, processadoEm: null, tentativas: tentativa })
      .where(eq(filaFiscal.id, jobId));
    return "RETRY";
  }
}

/** Loop do worker — roda em processo separado (server/fiscal/fila/run-worker.ts). */
export async function loopEmissor(intervaloMs = 5_000): Promise<void> {
  for (; ;) {
    try {
      const job = await pegarJob();
      if (job) await processarJobEmissao(job.id);
      else await new Promise((r) => setTimeout(r, intervaloMs));
    } catch (err) {
      console.error("[fiscal:emissor] erro no loop:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}
