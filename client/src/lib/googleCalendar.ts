/**
 * OllCLin - Integração com Google Calendar API
 * Arquitetura MVC - Serviço de integração externa
 *
 * Sincronização bidirecional de agendamentos OllCLin ↔ Google Calendar.
 * Usa OAuth2 para autenticação do profissional.
 *
 * ⚠️ SEGURANÇA LGPD:
 * - VITE_GOOGLE_CLIENT_SECRET NUNCA deve estar no frontend.
 * - A troca de código por tokens (exchangeGoogleCodeForTokens) deve ser
 *   feita exclusivamente no backend através do endpoint
 *   /api/google-calendar/callback.
 */

const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * Configurações necessárias (definir em .env):
 * VITE_GOOGLE_CLIENT_ID - ID do cliente OAuth do Google Cloud Console
 * VITE_GOOGLE_API_KEY - API key para chamadas públicas (opcional)
 */

export const googleCalendarConfig = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  redirectUri: `${window.location.origin}/api/oauth/google-calendar-callback`,
};

/**
 * Iniciar fluxo de autorização OAuth2 do Google Calendar
 * Redireciona o usuário para a tela de consentimento do Google
 */
export function startGoogleCalendarAuth() {
  if (!googleCalendarConfig.clientId) {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID não configurado. Defina no arquivo .env",
    );
  }

  const params = new URLSearchParams({
    client_id: googleCalendarConfig.clientId,
    redirect_uri: googleCalendarConfig.redirectUri,
    scope: googleCalendarConfig.scopes.join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  window.location.href = authUrl;
}

/**
 * Criar evento no Google Calendar
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  eventData: {
    calendarId?: string;
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: Array<{ email: string; displayName?: string }>;
    colorId?: string;
  },
): Promise<{ id: string; htmlLink: string; status: string }> {
  const calendarId = eventData.calendarId || "primary";

  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: eventData.summary,
        description: eventData.description,
        start: eventData.start,
        end: eventData.end,
        attendees: eventData.attendees,
        colorId: eventData.colorId,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Falha ao criar evento no Google Calendar: ${response.status} ${errorText}`,
    );
  }

  const data = await response.json();
  return {
    id: data.id,
    htmlLink: data.htmlLink,
    status: data.status,
  };
}

/**
 * Atualizar evento existente no Google Calendar
 */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  eventData: Partial<{
    summary: string;
    description: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees: Array<{ email: string; displayName?: string }>;
    colorId: string;
  }>,
  calendarId: string = "primary",
): Promise<{ id: string; htmlLink: string }> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events/${eventId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Falha ao atualizar evento no Google Calendar: ${response.status}`,
    );
  }

  const data = await response.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

/**
 * Deletar evento do Google Calendar
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId: string = "primary",
): Promise<void> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(
      `Falha ao deletar evento do Google Calendar: ${response.status}`,
    );
  }
}

/**
 * Buscar eventos do Google Calendar em um período
 */
export async function listGoogleCalendarEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
  calendarId: string = "primary",
): Promise<Array<{ id: string; summary: string; start: any; end: string; htmlLink: string }>> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${calendarId}/events?` +
      new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
      }),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Falha ao listar eventos do Google Calendar: ${response.status}`,
    );
  }

  const data = await response.json();
  return (data.items || []).map((item: any) => ({
    id: item.id,
    summary: item.summary,
    start: item.start,
    end: item.end,
    htmlLink: item.htmlLink,
  }));
}

/**
 * Obter URL de autorização para o usuário conectar sua agenda Google
 */
export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: googleCalendarConfig.clientId || "",
    redirect_uri: googleCalendarConfig.redirectUri,
    scope: googleCalendarConfig.scopes.join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Verificar se o usuário tem tokens de Google Calendar armazenados
 */
export function hasGoogleCalendarTokens(): boolean {
  if (typeof window === "undefined") return false;
  const tokens = localStorage.getItem("ollclin_google_calendar_tokens");
  return !!tokens;
}

/**
 * Armazenar tokens do Google Calendar (apenas no cliente, criptografar em produção)
 */
export function storeGoogleCalendarTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    "ollclin_google_calendar_tokens",
    JSON.stringify({
      ...tokens,
      storedAt: Date.now(),
    }),
  );
}

/**
 * Obter tokens armazenados
 */
export function getStoredGoogleCalendarTokens(): {
  access_token: string;
  refresh_token: string;
  expires_in: number;
} | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("ollclin_google_calendar_tokens");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Remover tokens armazenados (desconectar)
 */
export function clearGoogleCalendarTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("ollclin_google_calendar_tokens");
}

/**
 * Mapear cores do OllCLin para cores do Google Calendar
 */
export const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  primary: "1",    // Lavender (azul claro)
  success: "2",    // Sage (verde)
  surface: "3",    // Flamingo (rosa)
  background: "4", // Banana (amarelo)
  default: "9",    // Como pedra de sangue
};