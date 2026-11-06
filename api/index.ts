import type { Express, Request, Response } from "express";

let appPromise: Promise<Express> | undefined;

async function loadApp() {
  const { createApp } = await import("./backend.mjs");
  return createApp();
}

export default async function handler(req: Request, res: Response) {
  try {
    appPromise ??= loadApp();
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    appPromise = undefined;
    console.error("[Vercel] Falha ao inicializar a API OllCLin", error);
    return res.status(500).json({ error: "Falha ao inicializar a API" });
  }
}
