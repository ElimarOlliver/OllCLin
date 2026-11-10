/**
 * OllCLin — Worker de eventos fiscais (FISCAL.md §3/§7).
 *
 * Consome jobs operacao='EVENTO' da fila_fiscal: cancelamento, CCe,
 * manifestação, inutilização. Idempotente: evento já com protocolo é ignorado.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  certificados,
  eventosFiscais,
  filaFiscal,
  notasFiscais,
} from "../../../drizzle/schema/fiscal";
import { appointments } from "../../../drizzle/schema";
import { getAdapter } from "../adapters";
import { usar as usarCofre } from "../cofre";
import { logFiscal } from "../nota.service";
import type { Credencial, TipoEvento } from "../../../shared/fiscal/tipos";

const BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000];
const MAX_TENTATIVAS = 5;

/** Claim atômico de UM job de evento (mesmo padrão do emissor — R13). */
async function pegarJobEvento() {
  const db = await getDb();
  if (!db) return null;
  const agora = new Date();
  await db
    .update(filaFiscal)
    .set({ processadoEm: new Date() })
    .where(
      sql`${filaFiscal.id} = (
        SELECT f.id FROM (SELECT id FROM fila_fiscal WHERE processado_em IS NULL AND disponivel_em <= ${agora} AND operacao = 'EVENTO' ORDER BY disponivel_em ASC LIMIT 1) x
      )`,
    );
  const rows = await db.select().from(filaFiscal).orderBy(sql`id DESC`).limit(1);
  return rows[0] ?? null;
}

/**
 * Processa UM evento. Idempotente: evento com protocolo já resolvido → OK.
 */
export async function processarJobEvento(jobId: number): Promise<"OK" | "RETRY" | "DLQ"> {
  const db = await getDb();
  if (!db) return "RETRY";

  const jobs = await db.select().from(filaFiscal).where(eq(filaFiscal.id, jobId)).limit(1);
  const job = jobs[0];
  if (!job || job.processadoEm === null) return "OK"; // não é nosso / já processado

  // Evento pendente mais recente da nota
  const evs = await db
    .select()
    .from(eventosFiscais)
    .where(and(eq(eventosFiscais.notaId, job.notaId), eq(eventosFiscais.status, "ENFILEIRADO")))
    .limit(1);
  const evento = evs[0];
  if (!evento) return "OK"; // já processado por outra execução (R13)

  const notas = await db.select().from(notasFiscais).where(eq(notasFiscais.id, job.notaId)).limit(1);
  const nota = notas[0];
  if (!nota) return "DLQ";

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
  if (!cert) return "DLQ";

  try {
    const adapter = await getAdapter(nota.organizationId, nota.tipoDocumento, nota.ambiente);
    const ref = `${nota.serie}-${nota.numero}`;
    const resposta = await usarCofre(nota.organizationId, Number(cert.segredoRef), async (material, senha) => {
      const credencial: Credencial = {
        empresaId: nota.organizationId,
        tipo: cert.tipo,
        material,
        senha,
        validade: cert.validoAte,
      };
      return adapter.cancelar(ref, evento.motivo, credencial);
    });

    await logFiscal(nota.organizationId, nota.id, "gateway-mock", "cancelar", {
      responseResumo: `cStat=${resposta.cStat}`,
      cStat: resposta.cStat,
    });

    if (resposta.status === "CANCELADA" || resposta.status === "AUTORIZADA") {
      await db
        .update(eventosFiscais)
        .set({
          status: "PROCESSADO",
          protocolo: resposta.protocolo ?? null,
          xmlEvento: `<evento tipo="${evento.tipo}" cStat="${resposta.cStat}"/>`,
        })
        .where(eq(eventosFiscais.id, evento.id));
      await db
        .update(notasFiscais)
        .set({ status: "CANCELADA", cStat: resposta.cStat, xMotivo: resposta.xMotivo })
        .where(eq(notasFiscais.id, nota.id));
      // V5 — statusNota do agendamento vira CANCELADA, vínculo mantido
      await db
        .update(appointments)
        .set({ fiscalStatus: "CANCELADA" })
        .where(eq(appointments.id, nota.agendamentoId));
      return "OK";
    }

    const tentativa = job.tentativas + 1;
    if (tentativa >= MAX_TENTATIVAS) {
      await db
        .update(eventosFiscais)
        .set({ status: "ERRO" })
        .where(eq(eventosFiscais.id, evento.id));
      return "DLQ";
    }
    await db
      .update(eventosFiscais)
      .set({ status: "ENFILEIRADO" })
      .where(eq(eventosFiscais.id, evento.id));
    await db
      .update(filaFiscal)
      .set({
        tentativas: tentativa,
        processadoEm: null,
        disponivelEm: new Date(Date.now() + (BACKOFF_MS[Math.min(tentativa - 1, BACKOFF_MS.length - 1)] ?? 3_600_000)),
      })
      .where(eq(filaFiscal.id, jobId));
    return "RETRY";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    const tentativa = job.tentativas + 1;
    if (tentativa >= MAX_TENTATIVAS) {
      await db.update(eventosFiscais).set({ status: "ERRO" }).where(eq(eventosFiscais.id, evento.id));
      await db.update(filaFiscal).set({ erro: msg.slice(0, 500) }).where(eq(filaFiscal.id, jobId));
      return "DLQ";
    }
    await db
      .update(filaFiscal)
      .set({
        tentativas: tentativa,
        processadoEm: null,
        disponivelEm: new Date(Date.now() + (BACKOFF_MS[Math.min(tentativa - 1, BACKOFF_MS.length - 1)] ?? 3_600_000)),
      })
      .where(eq(filaFiscal.id, jobId));
    return "RETRY";
  }
}

/** Loop do worker de eventos — roda em processo dedicado. */
export async function loopEventos(intervaloMs = 5_000): Promise<void> {
  for (; ;) {
    try {
      const job = await pegarJobEvento();
      if (job) await processarJobEvento(job.id);
      else await new Promise((r) => setTimeout(r, intervaloMs));
    } catch (err) {
      console.error("[fiscal:eventos] erro no loop:", err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}

export type { TipoEvento };
