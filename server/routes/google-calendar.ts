/**
 * OllCLin - Rotas de Integração Google Calendar (backend)
 * Arquitetura MVC - Camada de rotas
 *
 * O único endpoint HTTP é o callback do OAuth2 do Google. Ele:
 * 1. valida o `state` assinado (CSRF + identificação do usuário);
 * 2. troca o código pelos tokens;
 * 3. grava os tokens CIFRADOS em `google_calendar_accounts`;
 * 4. devolve o usuário para a Agenda, sem expor token na URL.
 *
 * A listagem/criação de eventos é feita pelas procedures tRPC `googleAgenda`.
 */

import type { Express, Request, Response } from "express";
import { exchangeCode, getGoogleConfig, verifyOAuthState } from "../lib/google-calendar";
import { googleCalendarModel } from "../models/google-calendar.model";
import { writeAuditLog } from "../lib/audit";
import { getSchemaCapabilities, MIGRATION_0004_HINT } from "../lib/schema-capabilities";

function agendaRedirect(params: Record<string, string>): string {
  const url = new URL(`${getGoogleConfig().publicUrl}/agenda`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error("[Google Calendar] Falha no callback:", message);
  return message.slice(0, 300);
}

export function registerGoogleCalendarRoutes(app: Express) {
  // Callback do Google OAuth2 após o usuário autorizar o acesso.
  app.get("/api/google-calendar/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      const message =
        error === "access_denied"
          ? "Acesso ao Google Calendar não foi autorizado."
          : `Erro do Google: ${String(error).slice(0, 120)}`;
      res.redirect(agendaRedirect({ google_error: message }));
      return;
    }

    if (!code || typeof code !== "string") {
      res.redirect(
        agendaRedirect({ google_error: "Código de autorização não fornecido." }),
      );
      return;
    }
    if (!state || typeof state !== "string") {
      res.redirect(agendaRedirect({ google_error: "State OAuth ausente." }));
      return;
    }

    try {
      const owner = verifyOAuthState(state);

      const caps = await getSchemaCapabilities();
      if (!caps.googleCalendar) {
        throw new Error(MIGRATION_0004_HINT);
      }

      const tokens = await exchangeCode(code);
      if (!tokens.access_token) {
        throw new Error("O Google não retornou um access token.");
      }

      await googleCalendarModel.saveTokens({
        organizationId: owner.organizationId,
        userId: owner.userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        scope: tokens.scope,
      });

      await writeAuditLog({
        organizationId: owner.organizationId,
        userId: owner.userId,
        action: "CREATE",
        entity: "google_calendar_account",
        newValues: { connected: true, scope: tokens.scope ?? null },
        request: req,
      });

      res.redirect(agendaRedirect({ google_connected: "true" }));
    } catch (err) {
      res.redirect(agendaRedirect({ google_error: friendlyError(err) }));
    }
  });
}
