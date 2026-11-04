import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { resolveUserFromSupabaseAccessToken } from "../lib/supabase-auth";
import { resolveTenantAccessByEmail } from "../lib/tenant-access";
import { getSupabaseAdmin } from "../lib/supabase-server";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** Permissões granulares da conta (área -> none|partial|full). */
  areaPermissions?: Record<string, "none" | "partial" | "full">;
  /** true quando o usuário é o titular (owner) da conta. */
  isOwner?: boolean;
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

  // Fase 1 (SaaS): resolve o tenant ativo a partir do vínculo
  // organization_members (com fallback no vínculo legado users.organization_id).
  let isOwner = false;
  let areaPermissions: Record<string, "none" | "partial" | "full"> | undefined;

  if (user) {
    const tenant =
      user.openId === DEV_USER.openId
        ? { organizationId: DEV_USER.organizationId, role: DEV_USER.role }
        : await resolveTenantAccessByEmail(user.email);
    if (tenant) {
      user = {
        ...user,
        organizationId: tenant.organizationId,
        role: tenant.role,
      } as User;
    }

    // SaaS: titular (is_owner) e permissões granulares por área.
    if (user.organizationId && user.openId !== DEV_USER.openId) {
      try {
        const admin = getSupabaseAdmin();
        const local = await admin
          .from("users")
          .select("id, is_owner")
          .ilike("email", user.email ?? "")
          .limit(1)
          .maybeSingle<{ id: number; is_owner: boolean | null }>();

        if (local.data) {
          isOwner = Boolean(local.data.is_owner);

          const { data: perms } = await admin
            .from("member_permissions")
            .select("area_key, access_level")
            .eq("organization_id", user.organizationId)
            .eq("user_id", local.data.id);

          if (perms) {
            areaPermissions = {};
            for (const row of perms as Array<{ area_key: string; access_level: string }>) {
              areaPermissions[row.area_key] =
                row.access_level === "full" ? "full" : row.access_level === "partial" ? "partial" : "none";
            }
          }
        }
      } catch (error) {
        // Permissões granulares são opcionais: falha não bloqueia a sessão.
        console.warn(
          "[Auth] Falha ao carregar permissões granulares:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    isOwner,
    areaPermissions,
  };
}
