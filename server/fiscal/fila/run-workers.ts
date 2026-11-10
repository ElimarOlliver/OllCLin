/**
 * OllCLin — Entry point dos workers fiscais (FISCAL.md §3).
 *
 * Rode em processo dedicado: tsx server/fiscal/fila/run-workers.ts
 * Os três workers compartilham a mesma fila_fiscal (tabela MySQL), cada um
 * reivindicando apenas sua operação — um destino lento não trava os outros (R12).
 */

import { loopEmissor } from "./emissor.worker";
import { loopConsultor } from "./consultor.worker";
import { loopEventos } from "./eventos.worker";

const INTERVALO = Number(process.env.FISCAL_WORKER_INTERVAL_MS ?? 5_000);

console.log("[fiscal:workers] iniciando (intervalo %d ms)", INTERVALO);

// Emissor no processo principal; consultor e eventos em concorrência local.
// Em produção com múltiplas réplicas, cada processo pode rodar só um loop —
// a claim atômica garante idempotência (R13).
void loopEmissor(INTERVALO);
void loopConsultor(Math.max(INTERVALO, 15_000));
void loopEventos(INTERVALO);

process.on("SIGTERM", () => {
  console.log("[fiscal:workers] SIGTERM — encerrando");
  process.exit(0);
});
