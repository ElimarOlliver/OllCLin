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

export const protectedProcedure = t.procedure.use(requireUser);

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

const requirePermission = (permission: Permission) =>
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    const user = ctx.user;
    if (!user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    const permissions = permissionsForRole(user.role);
    const allowed = permissions.includes("*") || permissions.includes(permission);
    if (!allowed) {
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
  t.procedure.use(requirePermission(permission));
