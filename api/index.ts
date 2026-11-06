import type { Express, Request, Response } from "express";
import { createApp } from "../server/_core/index.ts";

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response) {
  try {
    appPromise ??= createApp();
    const app: Express = await appPromise;
    return app(req, res);
  } catch (error) {
    appPromise = undefined;
    console.error("[Vercel] Falha ao inicializar a API OllCLin", error);
    return res.status(500).json({ error: "Falha ao inicializar a API" });
  }
}
