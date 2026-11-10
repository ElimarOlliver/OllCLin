/**
 * OllCLin — Rotas express do módulo fiscal (download de XML/documento legal).
 *
 * R26/R27: o XML autorizado é o documento fiscal; serve SOMENTE com sessão
 * autenticada, SEMPRE filtrado por organizationId do usuário (R02).
 * NUNCA serve material de credencial (regra de ouro 1).
 */

import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { notasFiscais } from "../../drizzle/schema/fiscal";
import { sdk } from "../_core/sdk";
import { resolveTenantAccessByEmail } from "../lib/tenant-access";
import type { User } from "../../drizzle/schema";

/** Mesma resolução de sessão do tRPC (server/_core/context.ts), para express puro. */
async function resolveUser(req: Request): Promise<User | null> {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
}

export function registerFiscalRoutes(app: Express): void {
  /**
   * GET /api/fiscal/:notaId/xml — baixa o XML autorizado (documento legal).
   * Escopo: apenas notas da organizationId do usuário autenticado.
   */
  app.get("/api/fiscal/:notaId/xml", async (req: Request, res: Response) => {
    try {
      const raw = await resolveUser(req);
      if (!raw) return void res.status(401).json({ error: "Não autenticado" });
      const tenant = await resolveTenantAccessByEmail(raw.email);
      if (!tenant) return void res.status(403).json({ error: "Usuário sem organização" });
      const organizationId = tenant.organizationId;
      if (typeof organizationId !== "number" || organizationId <= 0) {
        return void res.status(403).json({ error: "Usuário sem organização" });
      }

      const notaId = Number(req.params.notaId);
      if (!Number.isInteger(notaId) || notaId <= 0) {
        return void res.status(400).json({ error: "ID inválido" });
      }

      const db = await getDb();
      if (!db) return void res.status(500).json({ error: "Banco indisponível" });

      const rows = await db
        .select({
          xmlAutorizado: notasFiscais.xmlAutorizado,
          chaveAcesso: notasFiscais.chaveAcesso,
          status: notasFiscais.status,
        })
        .from(notasFiscais)
        .where(
          and(
            eq(notasFiscais.id, notaId),
            eq(notasFiscais.organizationId, organizationId),
          ),
        )
        .limit(1);

      const nota = rows[0];
      if (!nota) return void res.status(404).json({ error: "Nota não encontrada" });
      if (!nota.xmlAutorizado) {
        return void res.status(404).json({ error: "XML autorizado indisponível" });
      }

      const filename = `nota-${nota.chaveAcesso ?? notaId}.xml`;
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return void res.send(nota.xmlAutorizado);
    } catch (err) {
      // Erro não vaza stack/dados de outra pessoa
      console.error("[fiscal:xml] erro:", err instanceof Error ? err.message : err);
      return void res.status(500).json({ error: "Erro ao baixar XML" });
    }
  });
}
