import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerGoogleCalendarRoutes } from "../routes/google-calendar";
import { registerPaymentRoutes } from "../routes/payments";
import { checkSupabaseConnection } from "../lib/supabase-server";
import { startGoogleSyncWorker } from "../services/google-sync.worker";

async function startServer() {
  const app = express();
  const server = createServer(app);
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
  startGoogleSyncWorker();
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV !== "production") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
