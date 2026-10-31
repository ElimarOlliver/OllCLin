/**
 * OllCLin - Integração com Google Calendar (backend)
 *
 * Este módulo concentra TODA a conversa com as APIs do Google. Nenhum token
 * chega ao navegador: o fluxo OAuth2 é concluído no servidor e as credenciais
 * ficam cifradas no banco (ver `server/lib/token-crypto.ts`).
 *
 * Variáveis de ambiente:
 * - GOOGLE_CLIENT_ID (fallback: VITE_GOOGLE_CLIENT_ID)
 * - GOOGLE_CLIENT_SECRET
 * - PUBLIC_URL / APP_URL (URL pública usada no redirect do OAuth)
 * - GOOGLE_CALENDAR_TIMEZONE (padrão: America/Sao_Paulo)
 * - GOOGLE_OAUTH_STATE_SECRET (opcional; assina o `state` do OAuth)
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/** Escopo mínimo para ler/gravar eventos na agenda do usuário. */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
];

export type GoogleCalendarEventTime = {
  dateTime?: string;
  date?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  start: GoogleCalendarEventTime;
  end: GoogleCalendarEventTime;
};

export type GoogleEventInput = {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
};

/** Erro de API do Google com o status HTTP preservado. */
export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  publicUrl: string;
  timeZone: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** URL pública do app (usada no redirect do OAuth e no retorno à Agenda). */
export function getPublicUrl(): string {
  const explicit =
    process.env.PUBLIC_URL ??
    process.env.APP_URL ??
    process.env.VITE_PUBLIC_URL ??
    process.env.VITE_APP_URL;
  if (explicit && explicit.trim()) return trimTrailingSlash(explicit.trim());
  return `http://localhost:${process.env.PORT ?? "3000"}`;
}

/** Lê a configuração sem lançar erro (útil para a tela de status). */
export function getGoogleConfig(): GoogleConfig {
  const clientId =
    process.env.GOOGLE_CLIENT_ID ?? process.env.VITE_GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const publicUrl = getPublicUrl();
  return {
    clientId: clientId.trim(),
    clientSecret: clientSecret.trim(),
    redirectUri: `${publicUrl}/api/google-calendar/callback`,
    publicUrl,
    timeZone: process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || "America/Sao_Paulo",
  };
}

/** Valores de exemplo comuns em `.env` (não são credenciais reais). */
const PLACEHOLDER_PATTERN =
  /(seu[-_ ]|sua[-_ ]|your[-_ ]|coloque|insira|example|placeholder|changeme|^xxx)/i;

function looksLikePlaceholder(value: string): boolean {
  return !value || PLACEHOLDER_PATTERN.test(value);
}

/** O servidor está apto a iniciar o fluxo OAuth? */
export function isGoogleCalendarConfigured(): boolean {
  const config = getGoogleConfig();
  return (
    !looksLikePlaceholder(config.clientId) &&
    !looksLikePlaceholder(config.clientSecret)
  );
}

function requireGoogleConfig(): GoogleConfig {
  const config = getGoogleConfig();
  const missing: string[] = [];
  if (looksLikePlaceholder(config.clientId)) missing.push("GOOGLE_CLIENT_ID");
  if (looksLikePlaceholder(config.clientSecret)) {
    missing.push("GOOGLE_CLIENT_SECRET");
  }
  if (missing.length > 0) {
    throw new GoogleCalendarError(
      `Google Calendar não configurado: informe credenciais reais de ${missing.join(
        " e ",
      )} no .env do servidor.`,
    );
  }
  return config;
}

async function googleFetch<T>(
  url: string,
  init: RequestInit,
  context: string,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    let detail = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as {
        error?: string | { message?: string };
        error_description?: string;
      };
      detail =
        parsed.error_description ??
        (typeof parsed.error === "string"
          ? parsed.error
          : parsed.error?.message) ??
        detail;
    } catch {
      // resposta não-JSON: mantém o texto original
    }
    throw new GoogleCalendarError(`${context}: ${detail}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

function stateSecret(): string {
  const explicit = process.env.GOOGLE_OAUTH_STATE_SECRET?.trim();
  if (explicit) return explicit;
  const fallback =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!fallback) {
    throw new GoogleCalendarError(
      "Defina GOOGLE_OAUTH_STATE_SECRET (ou SUPABASE_SECRET_KEY) para assinar o OAuth do Google Calendar.",
    );
  }
  return `ollclin:google-state:${fallback}`;
}

type OAuthStatePayload = {
  userId: number;
  organizationId: number;
  exp: number;
  nonce: string;
};

/**
 * Cria o `state` do OAuth: payload assinado (HMAC-SHA256) + validade curta.
 * O `state` evita CSRF e permite identificar o usuário no callback.
 */
export function createOAuthState(input: {
  userId: number;
  organizationId: number;
}): string {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    organizationId: input.organizationId,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(12).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

/** Valida assinatura e validade do `state`; devolve usuário/organização. */
export function verifyOAuthState(state: string): {
  userId: number;
  organizationId: number;
} {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) {
    throw new GoogleCalendarError("State OAuth inválido");
  }

  const expected = createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url");
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new GoogleCalendarError("Assinatura do state OAuth inválida");
  }

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as OAuthStatePayload;

  if (!payload?.exp || Date.now() > payload.exp) {
    throw new GoogleCalendarError(
      "A autorização expirou. Conecte o Google Calendar novamente.",
    );
  }
  if (!payload.userId || !payload.organizationId) {
    throw new GoogleCalendarError("State OAuth incompleto");
  }

  return {
    userId: payload.userId,
    organizationId: payload.organizationId,
  };
}

/** Monta a URL de consentimento do Google. */
export function buildAuthUrl(state: string): string {
  const config = requireGoogleConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    // `consent` garante o refresh_token mesmo em reconexões.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

/** Troca o código de autorização pelos tokens. */
export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const config = requireGoogleConfig();
  return googleFetch<GoogleTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    },
    "Falha ao trocar o código de autorização do Google",
  );
}

/** Renova o access token usando o refresh token. */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const config = requireGoogleConfig();
  return googleFetch<GoogleTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    },
    "Falha ao renovar o acesso ao Google Calendar",
  );
}

/** Revoga um token no Google (melhor esforço — não interrompe o fluxo). */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch (error) {
    console.warn(
      "[Google Calendar] Falha ao revogar token:",
      error instanceof Error ? error.message : error,
    );
  }
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function calendarPath(calendarId: string): string {
  return `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
}

/** Lista eventos de um período. */
export async function listEvents(
  accessToken: string,
  input: {
    timeMin: string;
    timeMax: string;
    calendarId?: string;
    maxResults?: number;
  },
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(input.maxResults ?? 2500, 2500)),
  });
  const data = await googleFetch<{ items?: GoogleCalendarEvent[] }>(
    `${calendarPath(input.calendarId ?? "primary")}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    "Falha ao listar eventos do Google Calendar",
  );
  return data.items ?? [];
}

/** Cria um evento na agenda informada. */
export async function createEvent(
  accessToken: string,
  event: GoogleEventInput,
  calendarId = "primary",
): Promise<GoogleCalendarEvent> {
  return googleFetch<GoogleCalendarEvent>(
    calendarPath(calendarId),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
    "Falha ao criar evento no Google Calendar",
  );
}

/** Atualiza um evento existente (PATCH preserva campos não enviados). */
export async function updateEvent(
  accessToken: string,
  eventId: string,
  event: Partial<GoogleEventInput>,
  calendarId = "primary",
): Promise<GoogleCalendarEvent> {
  return googleFetch<GoogleCalendarEvent>(
    `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    },
    "Falha ao atualizar evento no Google Calendar",
  );
}

/** Remove um evento (404/410 são tratados como já removido). */
export async function deleteEvent(
  accessToken: string,
  eventId: string,
  calendarId = "primary",
): Promise<void> {
  const response = await fetch(
    `${calendarPath(calendarId)}/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const text = await response.text();
    throw new GoogleCalendarError(
      `Falha ao remover evento do Google Calendar: ${text.slice(0, 200)}`,
      response.status,
    );
  }
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Normaliza a data do banco para o formato aceito pelo Google.
 *
 * As colunas de agendamento são `timestamp` sem fuso: o valor guardado já é a
 * hora local da clínica ("YYYY-MM-DDTHH:mm:ss"). Quando vier um ISO com fuso,
 * convertemos para a hora local do servidor antes de enviar, e o Google recebe
 * o `timeZone` configurado.
 */
export function toGoogleDateTime(value: string): string {
  const trimmed = value.trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (!hasZone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const base = trimmed.slice(0, 19);
    return base.length === 16 ? `${base}:00` : base;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new GoogleCalendarError(`Data inválida para o Google Calendar: ${value}`);
  }
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Fuso configurado para os eventos criados pelo OllCLin. */
export function googleTimeZone(): string {
  return getGoogleConfig().timeZone;
}
