/**
 * OllCLin - Tipos e utilitários do Google Calendar (frontend)
 *
 * ⚠️ SEGURANÇA LGPD:
 * O navegador NÃO guarda tokens do Google e NÃO chama a API do Google
 * diretamente. Toda a integração (OAuth, tokens e eventos) é feita no servidor
 * e exposta pelas procedures tRPC `googleAgenda.*`.
 */

export type GoogleEventTime = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  status: string | null;
  htmlLink: string | null;
  start: GoogleEventTime;
  end: GoogleEventTime;
};

/** Evento de dia inteiro (o Google usa `date` em vez de `dateTime`). */
export function isAllDayEvent(event: GoogleCalendarEvent): boolean {
  return Boolean(event.start.date && !event.start.dateTime);
}

/** Início do evento como Date (ou null quando inválido). */
export function googleEventStart(event: GoogleCalendarEvent): Date | null {
  const raw = event.start.dateTime ?? event.start.date;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Texto curto do período do evento, ex.: "09:00 – 09:30". */
export function formatGoogleEventTime(event: GoogleCalendarEvent): string {
  if (isAllDayEvent(event)) return "Dia inteiro";

  const start = googleEventStart(event);
  const end = event.end.dateTime ? new Date(event.end.dateTime) : null;
  if (!start) return "Horário não informado";

  const time = (date: Date) =>
    `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;

  return end && !Number.isNaN(end.getTime())
    ? `${time(start)} – ${time(end)}`
    : time(start);
}

/**
 * Cores do Google Calendar usadas quando o evento é criado pelo OllCLin.
 * Mantidas para uso futuro (a sincronização atual usa a cor padrão da agenda).
 */
export const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  primary: "1", // Lavanda (azul claro)
  success: "2", // Sálvia (verde)
  surface: "3", // Flamingo (rosa)
  background: "4", // Banana (amarelo)
  default: "9", // Mirtilo
};
