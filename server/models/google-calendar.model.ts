/**
 * OllCLin - Camada Model
 * Modelo de dados da integração com o Google Calendar (migração 0004)
 *
 * Responsabilidades:
 * - guardar as credenciais OAuth já cifradas (nunca em texto puro);
 * - renovar o access token quando estiver perto de expirar;
 * - manter o vínculo `appointments.google_calendar_event_id`.
 *
 * Todo acesso é filtrado por `organization_id` + `user_id` (isolamento por
 * tenant e por profissional), conforme a LGPD.
 */

import { getSupabaseAdmin } from "../lib/supabase-server";
import {
  decryptSecret,
  encryptSecret,
} from "../lib/token-crypto";
import {
  GoogleCalendarError,
  refreshAccessToken,
  revokeToken,
} from "../lib/google-calendar";
import { googleCalendarGuarded } from "../lib/schema-capabilities";

export type GoogleCalendarAccount = {
  id: number;
  organizationId: number;
  userId: number;
  calendarId: string;
  scope: string | null;
  connectedAt: string | null;
  revokedAt: string | null;
  tokenExpiresAt: string | null;
};

type GoogleCalendarAccountRow = {
  id: number;
  organization_id: number;
  user_id: number;
  calendar_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  connected_at: string | null;
  revoked_at: string | null;
};

const ACCOUNT_COLUMNS =
  "id, organization_id, user_id, calendar_id, access_token, refresh_token, token_expires_at, scope, connected_at, revoked_at";

/** Margem de segurança para renovar o token antes de ele expirar. */
const EXPIRY_MARGIN_MS = 60_000;

function toAccount(row: GoogleCalendarAccountRow): GoogleCalendarAccount {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    calendarId: row.calendar_id || "primary",
    scope: row.scope,
    connectedAt: row.connected_at,
    revokedAt: row.revoked_at,
    tokenExpiresAt: row.token_expires_at,
  };
}

function fail(context: string, error: { message: string } | null): never {
  throw new Error(
    `[google_calendar_accounts] ${context}: ${error?.message ?? "erro desconhecido"}`,
  );
}

async function findRow(
  organizationId: number,
  userId: number,
): Promise<GoogleCalendarAccountRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle<GoogleCalendarAccountRow>();

  if (error) fail("consultar conta", error);
  return data ?? null;
}

async function markRevoked(
  organizationId: number,
  userId: number,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("google_calendar_accounts")
    .update({
      revoked_at: new Date().toISOString(),
      access_token: "",
      refresh_token: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (error) {
    console.error(
      "[google_calendar_accounts] Falha ao marcar conta como revogada:",
      error.message,
    );
  }
}

async function saveTokensDirect(input: {
  organizationId: number;
  userId: number;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  calendarId?: string;
}): Promise<GoogleCalendarAccount> {
  const now = new Date();
  const record: Record<string, unknown> = {
    organization_id: input.organizationId,
    user_id: input.userId,
    calendar_id: input.calendarId ?? "primary",
    access_token: encryptSecret(input.accessToken),
    token_expires_at:
      typeof input.expiresIn === "number" && input.expiresIn > 0
        ? new Date(now.getTime() + input.expiresIn * 1000).toISOString()
        : null,
    scope: input.scope ?? null,
    connected_at: now.toISOString(),
    revoked_at: null,
    updated_at: now.toISOString(),
  };

  // Em reconexões o Google pode não devolver refresh_token; nesse caso o
  // token anterior é preservado (o upsert só atualiza as colunas enviadas).
  if (input.refreshToken) {
    record.refresh_token = encryptSecret(input.refreshToken);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_accounts")
    .upsert(record, { onConflict: "organization_id,user_id" })
    .select(ACCOUNT_COLUMNS)
    .single<GoogleCalendarAccountRow>();

  if (error || !data) fail("salvar credenciais", error);
  return toAccount(data);
}

export const googleCalendarModel = googleCalendarGuarded({
  /** Conta ativa do usuário (sem expor tokens). */
  async findActive(
    organizationId: number,
    userId: number,
  ): Promise<GoogleCalendarAccount | null> {
    const row = await findRow(organizationId, userId);
    if (!row || row.revoked_at) return null;
    return toAccount(row);
  },

  /** Grava/atualiza as credenciais cifradas após o callback do OAuth. */
  saveTokens(input: {
    organizationId: number;
    userId: number;
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    scope?: string;
    calendarId?: string;
  }): Promise<GoogleCalendarAccount> {
    return saveTokensDirect(input);
  },

  /**
   * Devolve um access token válido (renovando se necessário).
   * Retorna `null` quando não há conexão ativa.
   */
  async getAccessToken(
    organizationId: number,
    userId: number,
  ): Promise<{ accessToken: string; calendarId: string } | null> {
    const row = await findRow(organizationId, userId);
    if (!row || row.revoked_at || !row.access_token) return null;

    let accessToken = decryptSecret(row.access_token);
    const expiresAt = row.token_expires_at
      ? Date.parse(row.token_expires_at)
      : 0;

    if (expiresAt && expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
      if (!row.refresh_token) {
        await markRevoked(organizationId, userId);
        return null;
      }

      try {
        const refreshed = await refreshAccessToken(
          decryptSecret(row.refresh_token),
        );
        const updated = await saveTokensDirect({
          organizationId,
          userId,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresIn: refreshed.expires_in,
          scope: refreshed.scope ?? row.scope ?? undefined,
          calendarId: row.calendar_id || "primary",
        });
        accessToken = refreshed.access_token;
        return { accessToken, calendarId: updated.calendarId };
      } catch (error) {
        // `invalid_grant` = usuário revogou o acesso no Google.
        if (
          error instanceof GoogleCalendarError &&
          (error.status === 400 || error.status === 401)
        ) {
          await markRevoked(organizationId, userId);
          return null;
        }
        throw error;
      }
    }

    return { accessToken, calendarId: row.calendar_id || "primary" };
  },

  /** Desconecta: revoga no Google (melhor esforço) e limpa os tokens. */
  async disconnect(organizationId: number, userId: number): Promise<void> {
    const row = await findRow(organizationId, userId);
    if (!row) return;

    try {
      const token = row.refresh_token
        ? decryptSecret(row.refresh_token)
        : row.access_token
          ? decryptSecret(row.access_token)
          : null;
      if (token) await revokeToken(token);
    } catch (error) {
      console.warn(
        "[google_calendar_accounts] Falha ao revogar token no Google:",
        error instanceof Error ? error.message : error,
      );
    }

    await markRevoked(organizationId, userId);
  },

  /** Vincula/desvincula o evento do Google a um agendamento. */
  async setEventId(
    organizationId: number,
    appointmentId: number,
    eventId: string | null,
  ): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("appointments")
      .update({
        google_calendar_event_id: eventId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointmentId)
      .eq("organization_id", organizationId);
    if (error) fail("vincular evento ao agendamento", error);
  },
});
