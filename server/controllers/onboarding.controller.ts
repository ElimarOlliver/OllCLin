/**
 * OllCLin - Controller de Onboarding (primeiro acesso do owner)
 *
 * Fluxo: token de convite (hash SHA-256, 72h, uso único) → definir senha
 * (Supabase Auth) → dados da empresa + logo → onboarding completo.
 *
 * Segurança: token puro nunca persistido; rate limit na rota pública;
 * auditoria OWNER_ACTIVATED.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import * as model from "../models/provisioning.model";
import { getSupabaseAdmin } from "../lib/supabase-server";
import { writeAuditLog } from "../lib/audit";

/** Rate limit simples em memória por IP (rotas públicas de token). */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20; // tentativas
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}

export const onboardingRouter = router({
  /** Valida o token do convite (público). Retorna e-mail + nome da org. */
  validateToken: publicProcedure
    .input(z.object({ token: z.string().min(10) }))
    .query(async ({ input }) => {
      if (!checkRateLimit("onboarding:validate")) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Tente novamente em instantes." });
      }

      const invitation = await model.findValidInvitationByHash(model.hashToken(input.token));
      if (!invitation) {
        return { valid: false as const, reason: "Link inválido, expirado ou já utilizado." };
      }

      return {
        valid: true as const,
        email: invitation.email,
        organizationName: invitation.organizationName,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      };
    }),

  /**
   * Define a senha do owner (via convite owner_activation) e conclui o
   * onboarding mínimo. Sem logo (upload fica no passo opcional da view).
   */
  activateWithPassword: publicProcedure
    .input(
      z.object({
        token: z.string().min(10),
        password: z
          .string()
          .min(8, "Senha deve ter no mínimo 8 caracteres")
          .max(72)
          .regex(/[a-z]/, "Senha deve conter letra minúscula")
          .regex(/[A-Z]/, "Senha deve conter letra maiúscula")
          .regex(/[0-9]/, "Senha deve conter número"),
        organizationName: z.string().min(2).max(120).optional(),
        logoUrl: z.string().url().max(2048).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      if (!checkRateLimit("onboarding:activate")) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Tente novamente em instantes." });
      }

      const tokenHash = model.hashToken(input.token);
      const invitation = await model.findValidInvitationByHash(tokenHash);
      if (!invitation) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Link inválido, expirado ou já utilizado. Solicite um novo convite.",
        });
      }

      const admin = getSupabaseAdmin();
      const authKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
      const { createClient } = await import("@supabase/supabase-js");
      const auth = createClient(process.env.SUPABASE_URL ?? "", authKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      // Define a senha no Supabase Auth (sem enviar senha por e-mail).
      const { data: authUser } = await admin.auth.admin.listUsers();
      const target = authUser?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === invitation.email.toLowerCase(),
      );

      if (target) {
        const { error } = await auth.auth.admin.updateUserById(target.id, {
          password: input.password,
          email_confirm: true,
        });
        if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      } else {
        const { error } = await auth.auth.admin.createUser({
          email: invitation.email,
          password: input.password,
          email_confirm: true,
          user_metadata: { name: invitation.email.split("@")[0] },
        });
        if (error && !/already/i.test(error.message)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
      }

      // Usuário local (se ainda não existe)
      let localUserId = await model.findLocalUserIdByEmail(invitation.email);
      if (!localUserId) {
        localUserId = await model.createLocalUser({
          email: invitation.email,
          name: invitation.email.split("@")[0],
          organizationId: invitation.organizationId,
          role: invitation.role,
          isOwner: invitation.type === "owner_activation",
        });
      }

      // Vínculo ativo
      await model.upsertMembership({
        organizationId: invitation.organizationId,
        userId: localUserId,
        role: invitation.role,
        status: "active",
      });

      // Organização: nome/logo/onboarding completo
      const orgUpdate: Record<string, unknown> = { onboarding_completed_at: new Date().toISOString() };
      if (input.organizationName) orgUpdate.name = input.organizationName.trim();
      if (input.logoUrl) orgUpdate.logo_url = input.logoUrl;
      await admin.from("organizations").update(orgUpdate).eq("id", invitation.organizationId);

      // Token: uso único
      await model.markInvitationUsed(invitation.id);

      await writeAuditLog({
        organizationId: invitation.organizationId,
        userId: localUserId,
        action: "UPDATE",
        entity: "owner_activation",
        entityId: invitation.organizationId,
        newValues: { email: invitation.email, type: invitation.type },
      });

      return { success: true as const, organizationId: invitation.organizationId };
    }),

  /** Aceite de convite de equipe (staff_invite): define senha e ativa membro. */
  acceptInvite: publicProcedure
    .input(
      z.object({
        token: z.string().min(10),
        password: z.string().min(8).max(72).regex(/[a-z]/, "minúscula").regex(/[A-Z]/, "maiúscula").regex(/[0-9]/, "número"),
      }),
    )
    .mutation(async ({ input }) => {
      if (!checkRateLimit("onboarding:accept")) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Tente novamente em instantes." });
      }

      const tokenHash = model.hashToken(input.token);
      const invitation = await model.findValidInvitationByHash(tokenHash);
      if (!invitation) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Convite inválido, expirado ou já utilizado. Peça um reenvio ao titular.",
        });
      }

      const authKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
      const { createClient } = await import("@supabase/supabase-js");
      const auth = createClient(process.env.SUPABASE_URL ?? "", authKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });

      const admin = getSupabaseAdmin();
      const { data: authUser } = await admin.auth.admin.listUsers();
      const target = authUser?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === invitation.email.toLowerCase(),
      );

      if (target) {
        const { error } = await auth.auth.admin.updateUserById(target.id, {
          password: input.password,
          email_confirm: true,
        });
        if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      } else {
        const { error } = await auth.auth.admin.createUser({
          email: invitation.email,
          password: input.password,
          email_confirm: true,
        });
        if (error && !/already/i.test(error.message)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
      }

      let localUserId = await model.findLocalUserIdByEmail(invitation.email);
      if (!localUserId) {
        localUserId = await model.createLocalUser({
          email: invitation.email,
          name: invitation.email.split("@")[0],
          organizationId: invitation.organizationId,
          role: invitation.role,
          isOwner: false,
        });
      }

      await model.upsertMembership({
        organizationId: invitation.organizationId,
        userId: localUserId,
        role: invitation.role,
        status: "active",
      });

      await model.markInvitationUsed(invitation.id);

      await writeAuditLog({
        organizationId: invitation.organizationId,
        userId: localUserId,
        action: "UPDATE",
        entity: "invite_accepted",
        entityId: invitation.id,
        newValues: { email: invitation.email, role: invitation.role },
      });

      return { success: true as const };
    }),
});
