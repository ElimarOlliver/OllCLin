/**
 * OllCLin - Utilitários de data/hora (padrão brasileiro)
 *
 * Toda exibição de data no sistema deve passar por aqui para manter o formato
 * dd/MM/yyyy e HH:mm, independentemente do locale do navegador.
 */

import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type DateInput = string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;

  const parsed = parseISO(value);
  if (isValid(parsed)) return parsed;

  const fallback = new Date(value);
  return isValid(fallback) ? fallback : null;
}

/** dd/MM/yyyy */
export function formatDateBR(value: DateInput): string {
  const date = toDate(value);
  return date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : "—";
}

/** dd/MM/yyyy HH:mm */
export function formatDateTimeBR(value: DateInput): string {
  const date = toDate(value);
  return date ? format(date, "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";
}

/** HH:mm */
export function formatTimeBR(value: DateInput): string {
  const date = toDate(value);
  return date ? format(date, "HH:mm", { locale: ptBR }) : "—";
}

/** Valor para <input type="date"> (yyyy-MM-dd no fuso local). */
export function toDateInputValue(value: DateInput): string {
  const date = toDate(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}

/** Valor para <input type="time"> (HH:mm no fuso local). */
export function toTimeInputValue(value: DateInput): string {
  const date = toDate(value);
  return date ? format(date, "HH:mm") : "";
}

/**
 * Monta um Date local a partir de campos separados (yyyy-MM-dd + HH:mm).
 * Evita o deslocamento de fuso que acontece ao interpretar "yyyy-MM-ddTHH:mm"
 * como UTC em alguns navegadores.
 */
export function parseLocalDateTime(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  return isValid(parsed) ? parsed : null;
}

/** Data de hoje no formato aceito por <input type="date">. */
export function todayInputValue(): string {
  return format(new Date(), "yyyy-MM-dd");
}
