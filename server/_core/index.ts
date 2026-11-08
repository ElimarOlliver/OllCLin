import "dotenv/config";
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerGoogleCalendarRoutes } from "../routes/google-calendar";
import { registerPaymentRoutes } from "../routes/payments";
import { checkSupabaseConnection } from "../lib/supabase-server";
import { startGoogleSyncWorker } from "../services/google-sync.worker";
import type { Express } from "express";

export async function createApp(): Promise<Express> {
  const app = express();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/health/db", async (_req, res) => {
    const result = await checkSupabaseConnection();
    res.status(result.ok ? 200 : 503).json(result);
  });
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  // Rotas do site (usadas pelo framework externo / agentes para descobrir o
  // caminho principal antes de iniciar o servidor).
  app.get("/manus-routes.json", (_req, res) => {
    const routesPath = join(process.cwd(), "public", "manus-routes.json");
    if (!existsSync(routesPath)) {
      res.status(404).json({ routes: [] });
      return;
    }
    res.type("application/json").send(readFileSync(routesPath, "utf8"));
  });
  registerOAuthRoutes(app);
  registerGoogleCalendarRoutes(app);
  // Fase 5 (SaaS): documentação OpenAPI + webhook de pagamentos
  registerPaymentRoutes(app);
  // Fase 2 (SaaS): worker assíncrono da fila de sincronização Google Calendar.
  if (!process.env.VERCEL) startGoogleSyncWorker();
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
