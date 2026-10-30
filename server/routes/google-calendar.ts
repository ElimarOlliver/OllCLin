/**
 * OllCLin - Rotas de Integração Google Calendar (Backend)
 * Arquitetura MVC - Camada de rotas (Controller/Routes)
 *
 * Endpoints para OAuth2 do Google Calendar.
 */

import type { Express, Request, Response } from "express";

export function registerGoogleCalendarRoutes(app: Express) {
  // Callback do Google OAuth2 após o usuário autorizar o acesso
  app.get("/api/google-calendar/callback", async (req: Request, res: Response) => {
    const { code, error } = req.query;

    if (error) {
      res.status(400).send(`Erro do Google: ${error}`);
      return;
    }

    if (!code) {
      res.status(400).send("Código de autorização não fornecido");
      return;
    }

    try {
      // Trocar código por tokens (chamada para o Google)
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: process.env.VITE_GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: `${process.env.VITE_PUBLIC_URL ?? "http://localhost:3000"}/api/google-calendar/callback`,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        res.status(500).send("Falha ao trocar código por tokens");
        return;
      }

      const tokens = await tokenResponse.json();

      // Em produção, salve os tokens de forma segura associados ao usuário
      // (nunca envie o access_token pela URL - risco de vazamento/LGPD).
      const frontendUrl = process.env.VITE_PUBLIC_URL ?? "http://localhost:3000";
      res.redirect(`${frontendUrl}/agenda?google_connected=true`);
    } catch (err: any) {
      console.error("[Google Calendar] Erro no callback:", err.message);
      res.status(500).send("Erro interno no callback do Google Calendar");
    }
  });

  // Endpoint para listar eventos do Google Calendar (chamado pelo frontend)
  app.get("/api/google-calendar/events", async (req: Request, res: Response) => {
    const { accessToken, timeMin, timeMax, calendarId = "primary" } = req.query;

    if (!accessToken) {
      res.status(401).json({ error: "Access token não fornecido" });
      return;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
          new URLSearchParams({
            timeMin: timeMin as string,
            timeMax: timeMax as string,
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "2500",
          }),
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!response.ok) {
        res.status(response.status).json({ error: "Falha ao listar eventos" });
        return;
      }

      const data = await response.json();
      res.json(data.items || []);
    } catch (err: any) {
      console.error("[Google Calendar] Erro ao listar eventos:", err.message);
      res.status(500).json({ error: "Erro interno" });
    }
  });
}
