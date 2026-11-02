/**
 * OllCLin - Testes da fila de sincronização Google Calendar (Fase 2)
 */

import { describe, expect, it } from "vitest";
import {
  buildAppointmentSyncIdempotencyKey,
} from "./google-calendar-sync.service";

describe("buildAppointmentSyncIdempotencyKey (Fase 2)", () => {
  it("monta a chave no formato esperado", () => {
    const key = buildAppointmentSyncIdempotencyKey(42, 7, "2026-11-01T09:00:00");
    expect(key).toBe("appointment:42:user:7:version:2026-11-01T09:00:00");
  });

  it("diferencia versões do mesmo agendamento (mudanças incrementam a chave)", () => {
    const first = buildAppointmentSyncIdempotencyKey(42, 7, "2026-11-01T09:00:00");
    const second = buildAppointmentSyncIdempotencyKey(42, 7, "2026-11-01T10:00:00");
    expect(first).not.toBe(second);
  });

  it("diferencia usuários/agendamentos distintos", () => {
    expect(buildAppointmentSyncIdempotencyKey(1, 2, "v")).not.toBe(
      buildAppointmentSyncIdempotencyKey(2, 2, "v"),
    );
    expect(buildAppointmentSyncIdempotencyKey(1, 2, "v")).not.toBe(
      buildAppointmentSyncIdempotencyKey(1, 3, "v"),
    );
  });
});
