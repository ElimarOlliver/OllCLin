import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { resolveUserFromSupabaseAccessToken } from "../lib/supabase-auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * Usuário local de desenvolvimento.
 *
 * Só é ativado quando ALLOW_DEV_AUTH=true e o ambiente não é produção.
 * Serve para navegar no sistema enquanto o Supabase Auth (ou o OAuth do
 * Manus) ainda não está configurado. NUNCA habilite em produção.
 */
const DEV_USER = {
  id: 1,
  openId: "dev-local",
  name: "Administrador (dev)",
  email: "dev@ollclin.local",
  loginMethod: "dev",
  role: "admin",
  organizationId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} as unknown as User;

function devAuthEnabled(): boolean {
  return (
    process.env.ALLOW_DEV_AUTH === "true" && process.env.NODE_ENV !== "production"
  );
}

/** Extrai o bearer token do Supabase Auth (Authorization: Bearer <jwt>). */
function getBearerToken(req: Request): string | null {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme?.toLowerCase() !== "bearer") return null;
  const trimmed = token.trim();
  return trimmed || null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Fallback: Supabase Auth via JWT enviado pelo frontend (Bearer token).
  if (!user) {
    const bearerToken = getBearerToken(opts.req as Request);
    if (bearerToken) {
      try {
        user = await resolveUserFromSupabaseAccessToken(bearerToken);
      } catch (error) {
        console.warn(
          "[Auth] Falha ao resolver usuário do Supabase:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  if (!user && devAuthEnabled()) {
    user = DEV_USER;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
