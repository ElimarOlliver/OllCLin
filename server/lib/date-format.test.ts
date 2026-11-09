import { describe, it, expect } from "vitest";
import {
  formatDateBR,
  formatDateTimeBR,
  formatTimeBR,
  parseLocalDateTime,
  toDateInputValue,
  toTimeInputValue,
} from "../../client/src/lib/date";

describe("Utilitários de data no padrão brasileiro", () => {
  it("formata data como dd/MM/yyyy", () => {
    expect(formatDateBR("2026-11-09")).toBe("09/11/2026");
  });

  it("formata data e hora como dd/MM/yyyy HH:mm", () => {
    const local = new Date(2026, 10, 9, 14, 30, 0);
    expect(formatDateTimeBR(local)).toBe("09/11/2026 14:30");
  });

  it("formata apenas a hora como HH:mm", () => {
    const local = new Date(2026, 10, 9, 8, 5, 0);
    expect(formatTimeBR(local)).toBe("08:05");
  });

  it("monta Date local a partir dos campos yyyy-MM-dd e HH:mm", () => {
    const parsed = parseLocalDateTime("2026-11-09", "14:30");
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(10);
    expect(parsed?.getDate()).toBe(9);
    expect(parsed?.getHours()).toBe(14);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it("converte para os valores dos inputs mantendo data/hora local", () => {
    const local = new Date(2026, 10, 9, 14, 30, 0);
    expect(toDateInputValue(local)).toBe("2026-11-09");
    expect(toTimeInputValue(local)).toBe("14:30");
  });

  it("retorna travessão para valores ausentes ou inválidos", () => {
    expect(formatDateBR(null)).toBe("—");
    expect(formatDateTimeBR("não é data")).toBe("—");
    expect(parseLocalDateTime("", "10:00")).toBeNull();
  });
});
