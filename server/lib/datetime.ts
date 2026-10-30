/**
 * OllCLin - Utilitários de data/hora
 *
 * As colunas de data do banco são `timestamp` (sem fuso). Para evitar
 * deslocamentos de horário (ex.: 10:00 virar 13:00), gravamos sempre a hora
 * local no formato "YYYY-MM-DDTHH:mm:ss", sem o sufixo "Z".
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDbTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida: ${String(value)}`);
  }

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function nowDbTimestamp(): string {
  return toDbTimestamp(new Date());
}
