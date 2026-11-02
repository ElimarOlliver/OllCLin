/**
 * OllCLin - Worker de Sincronização Google Calendar (Fase 2 — SaaS)
 *
 * Processa a fila `calendar_sync_jobs` (PostgreSQL) com:
 * - operação: create | update | delete | pull | reconcile;
 * - idempotência via `idempotency_key` (unique constraint);
 * - retries com backoff exponencial (30s base, máx. 24h);
 * - resultado registrado no vínculo `appointment_google_events`.
 *
 * O agendamento local não depende mais de uma chamada síncrona ao Google:
 * a alteração é persistida primeiro e a fila reflete no Google depois.
 */

import {
  googleCalendarSyncModel,
  type CalendarSyncJob,
  type SyncOperation,
} from "../models/google-calendar-sync.model";
import { appointmentModel } from "../models/appointment.model";
import {
  pullGoogleRangeForUser,
  removeAppointmentForUser,
  syncAppointmentForUser,
  type GoogleSyncResult,
  type PullSyncResult,
} from "./google-calendar-sync.service";

/** Backoff inicial do retry (ms). */
export const GOOGLE_SYNC_BACKOFF_BASE_MS = 30_000;
/** Backoff máximo do retry (ms) — evita retries infinitos. */
export const GOOGLE_SYNC_BACKOFF_MAX_MS = 24 * 60 * 60 * 1000;

export type GoogleSyncJobFailure = {
  jobId: number;
  appointmentId: number;
  userId: number;
  operation: SyncOperation;
  status: "done" | "failed";
  result?: GoogleSyncResult | PullSyncResult;
  error?: string;
};

export type GoogleSyncWorkerRunResult = {
  processed: number;
  results: GoogleSyncJobFailure[];
};

/** Busca o próximo job pronto para processamento. */
async function claimDueJobs(limit = 10): Promise<CalendarSyncJob[]> {
  const jobs = await googleCalendarSyncModel.findDueJobs(limit);
  const claimed: CalendarSyncJob[] = [];
  for (const job of jobs) {
    const current = await googleCalendarSyncModel.findById(job.id);
    if (!current || current.status !== "pending") continue;
    const updated = await googleCalendarSyncModel.updateJobStatus(current.id, "processing", {
      attempts: current.attempts + 1,
    });
    if (updated) claimed.push(updated);
  }
  return claimed;
}

/** Calcula o próximo `next_attempt_at` com backoff exponencial. */
function nextAttemptAt(attempts: number): string {
  const backoffMs = Math.min(
    GOOGLE_SYNC_BACKOFF_BASE_MS * Math.pow(2, Math.max(attempts - 1, 0)),
    GOOGLE_SYNC_BACKOFF_MAX_MS,
  );
  return new Date(Date.now() + backoffMs).toISOString();
}

/** Busca o agendamento do job respeitando o tenant. */
async function findAppointmentForJob(job: CalendarSyncJob) {
  return appointmentModel.findById(job.appointmentId, job.organizationId);
}

/**
 * Executa uma única operação do job na fila.
 * Lança erro para que o worker registre retry (backoff).
 */
export async function processSyncJob(job: CalendarSyncJob): Promise<GoogleSyncResult | PullSyncResult> {
  const appointment = await findAppointmentForJob(job);

  switch (job.operation) {
    case "create":
    case "update": {
      if (!appointment) {
        // Agendamento já não existe (ex.: exclusão anterior) — operação concluída.
        return { status: "skipped" };
      }
      // `syncAppointmentForUser` cuida de conflito (retorna status) e de
      // create/update no Google; retorna `not_connected` sem conta ativa.
      return syncAppointmentForUser(appointment, job.userId);
    }

    case "delete": {
      if (!appointment) {
        // Nada para remover no Google caso o agendamento já não exista.
        return { status: "skipped" };
      }
      // `removeAppointmentForUser` já trata desmarcado → remoção do evento.
      return removeAppointmentForUser(appointment, job.userId);
    }

    case "pull":
    case "reconcile": {
      const from = typeof job.payload?.from === "string" ? job.payload.from : null;
      const to = typeof job.payload?.to === "string" ? job.payload.to : null;
      if (!from || !to) {
        // Payload sem período informado: nada a reconciliar.
        return { status: "skipped" };
      }
      return pullGoogleRangeForUser({
        organizationId: job.organizationId,
        userId: job.userId,
        from,
        to,
      });
    }

    default:
      throw new Error(`[google_sync] Operação desconhecida: ${String(job.operation)}`);
  }
}

/**
 * Busca, claim e executa os jobs vencidos. Erros são registrados com retry
 * (backoff); sucesso marca o job como `done`.
 */
export async function processDueSyncJobs(
  options: { limit?: number; now?: Date } = {},
): Promise<GoogleSyncWorkerRunResult> {
  const limit = options.limit ?? 10;
  const jobs = await claimDueJobs(limit);
  const results: GoogleSyncJobFailure[] = [];

  for (const job of jobs) {
    const base = {
      jobId: job.id,
      appointmentId: job.appointmentId,
      userId: job.userId,
      operation: job.operation,
    };

    try {
      const result = await processSyncJob(job);
      await googleCalendarSyncModel.updateJobStatus(job.id, "done", { lastError: null });
      results.push({ ...base, status: "done", result });
    } catch (error) {
      const attempts = (job.attempts ?? 0) + 1;
      const message = error instanceof Error ? error.message : "Erro desconhecido no worker";
      await googleCalendarSyncModel.updateJobStatus(job.id, "failed", {
        attempts,
        nextAttemptAt: nextAttemptAt(attempts),
        lastError: message,
      });
      results.push({ ...base, status: "failed", error: message });
    }
  }

  return { processed: results.length, results };
}

let workerTimer: ReturnType<typeof setInterval> | null = null;

/** Inicia o worker com polling da fila (PostgreSQL-based queue). */
export function startGoogleSyncWorker(intervalMs = 15_000): () => void {
  if (workerTimer) return () => undefined;
  workerTimer = setInterval(() => {
    void processDueSyncJobs().catch((error) => {
      console.error("[google_sync] Falha no worker de sincronização:", error);
    });
  }, intervalMs);
  workerTimer.unref?.();
  return () => {
    if (workerTimer) {
      clearInterval(workerTimer);
      workerTimer = null;
    }
  };
}

/** Para o worker (útil em testes). */
export function stopGoogleSyncWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
}
