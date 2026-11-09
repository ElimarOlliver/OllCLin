import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

const requireTenantScope = t.middleware(async (opts) => {
  const { ctx, input, next } = opts;
  const requested = (input as { organizationId?: unknown } | undefined)?.organizationId;

  if (typeof requested === "number") {
    const active = ctx.user?.organizationId ?? null;
    if (active === null || requested !== active) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Acesso negado para esta organização.",
      });
    }
  }

  return next();
});

export const protectedProcedure = t.procedure
  .use(requireUser)
  .use(requireTenantScope);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Permissões (Fase 1 — SaaS / RBAC)
// ---------------------------------------------------------------------------
export type Permission =
  | "*"
  | "patients.read"
  | "patients.write"
  | "appointments.read"
  | "appointments.write"
  | "professionals.manage"
  | "finance.read"
  | "finance.write"
  | "reports.export"
  | "organization.manage"
  | "chat.use"
  | "google_calendar.connect";

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ["*"],
  admin: ["*"],
  doctor: [
    "patients.read",
    "appointments.read",
    "appointments.write",
    "chat.use",
    "google_calendar.connect",
  ],
  receptionist: [
    "patients.read",
    "patients.write",
    "appointments.read",
    "appointments.write",
    "chat.use",
  ],
  financial: ["finance.read", "finance.write", "reports.export"],
  assistant: ["patients.read", "appointments.read", "appointments.write", "chat.use"],
  readonly: ["patients.read", "appointments.read"],
};

export function permissionsForRole(role?: string | null): Permission[] {
  const key = (role ?? "").trim().toLowerCase();
  if (key === "owner" || key === "admin") return ["*"];
  return key ? ROLE_PERMISSIONS[key] ?? [] : [];
}

/**
 * Mapeia uma permissão tRPC para a área do catálogo (permission_areas) que a
 * governa. Áreas sem entrada retornam null (só RBAC clássico se aplica).
 */
const PERMISSION_AREA_MAP: Record<string, string> = {
  "patients": "pacientes",
  "appointments": "agenda",
  "professionals": "profissionais",
  "finance": "financeiro",
  "reports": "relatorios",
  "organization": "usuarios",
};

export function areaForPermission(permission: Permission): string | null {
  if (permission === "*") return null;
  const [domain] = permission.split(".");
  return PERMISSION_AREA_MAP[domain] ?? null;
}

const requirePermission = (permission: Permission) =>
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    const user = ctx.user;
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    // SaaS: titular da conta tem acesso master a tudo.
    if (ctx.isOwner) {
      return next({ ctx: { ...ctx, user } });
    }

    const permissions = permissionsForRole(user.role);
    const allowed = permissions.includes("*") || permissions.includes(permission);

    // SaaS: permissão granular por área (setada pelo titular na página
    // Permissões). "full" libera a área; "partial" só leitura.
    let areaGranted: boolean | null = null;
    if (ctx.areaPermissions) {
      const area = areaForPermission(permission);
      if (area && area in ctx.areaPermissions) {
        const level = ctx.areaPermissions[area];
        if (level === "full") areaGranted = true;
        else if (level === "partial") areaGranted = permission.endsWith(".read");
        else areaGranted = false;
      }
    }

    const finalAllowed = areaGranted !== null ? areaGranted : allowed;
    if (!finalAllowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permissão negada: ${permission}`,
      });
    }

    return next({ ctx: { ...ctx, user } });
  });

/**
 * protectedProcedure com permissão específica do RBAC (Fase 1 — SaaS).
 * A autorização roda em camada de procedure; o RLS e o serviço completam.
 */
export const protectedWith = (permission: Permission) =>
  t.procedure.use(requirePermission(permission)).use(requireTenantScope);
