/**
 * OllCLin — Worker consultor fiscal (FISCAL.md §7, R15).
 *
 * Reconsulta no órgão as notas ERRO_TRANSITORIO com protocolo pendente antes
 * de qualquer reenvio — o worker emissor não retransmite sem esta consulta
 * (R15: reenviar sem consultar gera cStat 539/204 ou nota duplicada legal).
 *
 * Fluxo: nota ERRO_TRANSITORIO/ENVIANDO envelhecida → adapter.consultar(ref)
 * → se AUTORIZADA, finaliza; se continua transitória, devolve à fila com backoff.
 */

import { and, eq, lt, or } from "drizzle-orm";
import { getDb } from "../../db";
import {
  certificados,
  filaFiscal,
  notasFiscais,
} from "../../../drizzle/schema/fiscal";
import { appointments } from "../../../drizzle/schema";
import { getAdapter } from "../adapters";
import { usar as usarCofre } from "../cofre";
import { logFiscal } from "../nota.service";
import { interpretarCStat } from "../../../shared/fiscal/codigos-rejeicao";
import type { Credencial } from "../../../shared/fiscal/tipos";

/** Notas cujo status pode ter mudado no órgão e merecem reconsulta. */
const STATUSES_CONSULTAVEIS = ["ENVIANDO", "ERRO_TRANSITORIO"] as const;

/**
 * Consulta UMA nota no órgão (R15). Retorna o status resultante ou "RETRY".
 * Nunca lança — registra erro e deixa o retry decidir.
 */
export async function consultarNota(notaId: number): Promise<"OK" | "RETRY" | "DLQ"> {
  const db = await getDb();
  if (!db) return "RETRY";

  const rows = await db.select().from(notasFiscais).where(eq(notasFiscais.id, notaId)).limit(1);
  const nota = rows[0];
  if (!nota) return "OK";

  // Idempotente: estados definitivos não são reconsultados
  if (["AUTORIZADA", "CANCELADA", "REJEITADA", "DENEGADA", "SUBSTITUIDA"].includes(nota.status)) {
    return "OK";
  }

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
    // ref = chave natural + numero — o gateway usa esta referência p/ consulta
    const ref = `${nota.serie}-${nota.numero}`;
    const resposta = await usarCofre(nota.organizationId, Number(cert.segredoRef), async (material, senha) => {
      const credencial: Credencial = {
        empresaId: nota.organizationId,
        tipo: cert.tipo,
        material,
        senha,
        validade: cert.validoAte,
      };
      return adapter.consultar(ref, credencial);
    });

    await logFiscal(nota.organizationId, nota.id, "gateway-mock", "consultar", {
      responseResumo: `cStat=${resposta.cStat}`,
      cStat: resposta.cStat,
    });

    if (resposta.status === "AUTORIZADA") {
      // A transmissão anterior tinha chegado — finaliza sem reenviar (R15)
      await db
        .update(notasFiscais)
        .set({
          status: "AUTORIZADA",
          cStat: resposta.cStat,
          xMotivo: resposta.xMotivo,
          protocolo: resposta.protocolo ?? nota.protocolo,
          autorizadoEm: new Date(),
        })
        .where(eq(notasFiscais.id, nota.id));
      await db
        .update(appointments)
        .set({ fiscalStatus: "EMITIDA", fiscalNotaId: nota.id })
        .where(eq(appointments.id, nota.agendamentoId));
      return "OK";
    }

    // Mapa de rejeição decide (R23/R24)
    const interpretação = interpretarCStat(resposta.cStat);
    await db
      .update(notasFiscais)
      .set({ status: interpretação.status, cStat: resposta.cStat, xMotivo: resposta.xMotivo })
      .where(eq(notasFiscais.id, nota.id));
    if (!interpretação.retentavel) {
      await db
        .update(appointments)
        .set({ fiscalStatus: "ERRO" })
        .where(eq(appointments.id, nota.agendamentoId));
      return "DLQ";
    }
    return "RETRY";
  } catch (err) {
    // Sem resposta: continua transitória — volta para a fila do emissor
    console.error("[fiscal:consultor] erro:", err instanceof Error ? err.message : err);
    return "RETRY";
  }
}

/**
 * Varre notas envelhecidas em status transitório e enfileira reconsultas.
 * Chamado pelo loop do worker ou por cron.
 */
export async function enfileirarConsultas(atrasMs = 60_000): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const limite = new Date(Date.now() - atrasMs);
  const pendentes = await db
    .select({ id: notasFiscais.id, organizationId: notasFiscais.organizationId })
    .from(notasFiscais)
    .where(
      and(
        or(
          eq(notasFiscais.status, "ENVIANDO"),
          eq(notasFiscais.status, "ERRO_TRANSITORIO"),
        ),
        lt(notasFiscais.enfileiradoEm, limite),
      ),
    )
    .limit(50);

  let enfileiradas = 0;
  for (const n of pendentes) {
    await db.insert(filaFiscal).values({
      destino: `fila:fiscal:consultar`,
      notaId: n.id,
      organizationId: n.organizationId,
      operacao: "CONSULTAR",
    });
    enfileiradas++;
  }
  return enfileiradas;
}

/** Loop do consultor — roda em processo dedicado. */
export async function loopConsultor(intervaloMs = 15_000): Promise<void> {
  for (; ;) {
    try {
      await enfileirarConsultas();
    } catch (err) {
      console.error("[fiscal:consultor] erro no loop:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
}

/** Utilitário interno para testes: statuses consultáveis visíveis. */
export const STATUS_CONSULTAVEIS = STATUSES_CONSULTAVEIS;
