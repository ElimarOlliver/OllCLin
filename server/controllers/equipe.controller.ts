/**
 * OllCLin - Controller da Equipe (RBAC / gestão de usuários)
 *
 * Regras:
 * - organization_id vem SEMPRE da sessão (ctx), nunca do input.
 * - Admin não cria/promove owner nem altera outro owner.
 * - Toda organização precisa de pelo menos 1 owner ativo.
 * - Convites pendentes são reenviados, não duplicados.
 * - Auditoria: STAFF_INVITED, INVITE_RESENT, INVITE_REVOKED, ROLE_CHANGED,
 *   MEMBER_DISABLED, MEMBER_ENABLED.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import * as model from "../models/provisioning.model";
import { getSupabaseAdmin } from "../lib/supabase-server";
import { writeAuditLog } from "../lib/audit";
import { getEmailService } from "../lib/email";
import { PUBLIC_URL_FALLBACK } from "../lib/public-url";

const ROLES = ["admin", "doctor", "receptionist", "financial", "assistant", "readonly"] as const;
type StaffRole = (typeof ROLES)[number];

function isStaffRole(value: string): value is StaffRole {
  return (ROLES as readonly string[]).includes(value);
}

/** Somente owner/admin (team.manage) e exige ctx de tenant. */
function requireManager(ctx: {
  user: {
    organizationId: number | null;
    email: string | null;
    isOwner?: boolean;
    role?: string | null;
  } | null;
}) {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login." });
  if (!user.organizationId) throw new TRPCError({ code: "FORBIDDEN", message: "Sem organização ativa." });
  if (!user.isOwner && user.role !== "admin" && user.role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente titular/admin gerenciam a equipe." });
  }
  return user as { organizationId: number; email: string; isOwner?: boolean; role: string };
}

async function localIdFor(email: string | null | undefined): Promise<number | null> {
  if (!email) return null;
  return model.findLocalUserIdByEmail(email);
}

/** Conta owners ativos da organização. */
async function countActiveOwners(organizationId: number): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("status", "active");
  return count ?? 0;
}

export const equipeRouter = router({
  /** Lista membros + convites pendentes da organização. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const manager = requireManager(ctx);
    const admin = getSupabaseAdmin();

    const members = await model.listOrganizationMembersWithPermissions(manager.organizationId);
    const { data: invites } = await admin
      .from("account_invitations")
      .select("id, email, role, type, expires_at, created_at")
      .eq("organization_id", manager.organizationId)
      .is("used_at", null)
      .order("created_at", { ascending: false });

    return {
      members,
      invites: (invites ?? []).map((i: Record<string, unknown>) => ({
        id: Number(i.id),
        email: String(i.email),
        role: String(i.role),
        type: String(i.type),
        expiresAt: String(i.expires_at),
      })),
    };
  }),

  /** Convida um colaborador (staff_invite) — 72h de validade. */
  invite: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(ROLES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const manager = requireManager(ctx);
      const email = input.email.trim().toLowerCase();
      const admin = getSupabaseAdmin();

      // Já é membro ativo?
      const existingUserId = await model.findLocalUserIdByEmail(email);
      if (existingUserId) {
        const { data: member } = await admin
          .from("organization_members")
          .select("id, status")
          .eq("organization_id", manager.organizationId)
          .eq("user_id", existingUserId)
          .maybeSingle<{ id: number; status: string }>();
        if (member?.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Este e-mail já é membro ativo da equipe." });
        }
      }

      // Convite pendente? → reenvia
      const { data: pending } = await admin
        .from("account_invitations")
        .select("id, token_hash, expires_at")
        .eq("organization_id", manager.organizationId)
        .ilike("email", email)
        .is("used_at", null)
        .maybeSingle<{ id: number; token_hash: string; expires_at: string }>();

      if (pending) {
        // Reenvio: gera NOVO token (o hash antigo é substituído) e estende 72h.
        const token = model.generateToken();
        const { error } = await admin
          .from("account_invitations")
          .update({
            token_hash: model.hashToken(token),
            expires_at: new Date(Date.now() + 72 * 3_600_000).toISOString(),
          })
          .eq("id", pending.id);
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

        const managerLocal = await localIdFor(manager.email);
        await model.createInvitation; // (noop guard — keep lints honest)
        await writeAuditLog({
          organizationId: manager.organizationId,
          userId: managerLocal,
          action: "UPDATE",
          entity: "invite_resent",
          entityId: pending.id,
          newValues: { email },
        });

        const base = process.env.PUBLIC_URL || PUBLIC_URL_FALLBACK;
        try {
          await getEmailService().sendInvitationEmail({
            to: email,
            linkUrl: `${base}/aceitar-convite?token=${encodeURIComponent(token)}`,
            organizationName: "",
            role: input.role,
            expiresInHours: 72,
          });
        } catch (error) {
          console.error("[Equipe] Falha ao reenviar convite:", error);
        }
        return { success: true as const, resent: true as const };
      }

      // Novo convite
      const token = model.generateToken();
      const managerLocal = await localIdFor(manager.email);
      await model.createInvitation({
        organizationId: manager.organizationId,
        email,
        role: input.role,
        type: "staff_invite",
        expiresAt: new Date(Date.now() + 72 * 3_600_000),
        invitedBy: managerLocal,
        tokenHash: model.hashToken(token),
      });

      await writeAuditLog({
        organizationId: manager.organizationId,
        userId: managerLocal,
        action: "CREATE",
        entity: "staff_invited",
        newValues: { email, role: input.role },
      });

      const base = process.env.PUBLIC_URL || PUBLIC_URL_FALLBACK;
      try {
        await getEmailService().sendInvitationEmail({
          to: email,
          linkUrl: `${base}/aceitar-convite?token=${encodeURIComponent(token)}`,
          organizationName: "",
          role: input.role,
          expiresInHours: 72,
        });
      } catch (error) {
        console.error("[Equipe] Falha ao enviar convite:", error);
      }

      return { success: true as const, resent: false as const };
    }),

  /** Revoga convite pendente. */
  revokeInvite: protectedProcedure
    .input(z.object({ invitationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const manager = requireManager(ctx);
      const admin = getSupabaseAdmin();
      const { error } = await admin
        .from("account_invitations")
        .delete()
        .eq("id", input.invitationId)
        .eq("organization_id", manager.organizationId)
        .is("used_at", null);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const managerLocal = await localIdFor(manager.email);
      await writeAuditLog({
        organizationId: manager.organizationId,
        userId: managerLocal,
        action: "DELETE",
        entity: "invite_revoked",
        entityId: input.invitationId,
      });
      return { success: true as const };
    }),

  /** Altera papel. Admin não altera owner; último owner protegido. */
  updateRole: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        role: z.enum(ROLES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const manager = requireManager(ctx);
      const admin = getSupabaseAdmin();

      const { data: target } = await admin
        .from("organization_members")
        .select("id, role, status")
        .eq("organization_id", manager.organizationId)
        .eq("user_id", input.userId)
        .maybeSingle<{ id: number; role: string; status: string }>();

      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });

      // Admin não altera owner
      if (!manager.isOwner && target.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente o titular altera outro titular." });
      }

      // Último owner não pode ser rebaixado
      if (target.role === "owner" && target.status === "active") {
        const owners = await countActiveOwners(manager.organizationId);
        if (owners <= 1) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "A organização precisa de pelo menos 1 titular ativo.",
          });
        }
      }

      const { error } = await admin
        .from("organization_members")
        .update({ role: input.role })
        .eq("id", target.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      // Espelha no users.role (fallback do tenant-access)
      await admin.from("users").update({ role: input.role }).eq("id", input.userId);

      const managerLocal = await localIdFor(manager.email);
      await writeAuditLog({
        organizationId: manager.organizationId,
        userId: managerLocal,
        action: "UPDATE",
        entity: "role_changed",
        entityId: input.userId,
        oldValues: { role: target.role },
        newValues: { role: input.role },
      });
      return { success: true as const };
    }),

  /** Desativa membro (soft). Último owner protegido. */
  disable: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const manager = requireManager(ctx);
      const admin = getSupabaseAdmin();

      if (manager.email) {
        const self = await localIdFor(manager.email);
        if (self === input.userId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não pode desativar a si mesmo." });
        }
      }

      const { data: target } = await admin
        .from("organization_members")
        .select("id, role, status")
        .eq("organization_id", manager.organizationId)
        .eq("user_id", input.userId)
        .maybeSingle<{ id: number; role: string; status: string }>();
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Membro não encontrado." });

      if (!manager.isOwner && target.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Somente o titular desativa outro titular." });
      }

      if (target.role === "owner" && target.status === "active") {
        const owners = await countActiveOwners(manager.organizationId);
        if (owners <= 1) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "A organização precisa de pelo menos 1 titular ativo.",
          });
        }
      }

      const { error } = await admin
        .from("organization_members")
        .update({ status: "disabled" })
        .eq("id", target.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const managerLocal = await localIdFor(manager.email);
      await writeAuditLog({
        organizationId: manager.organizationId,
        userId: managerLocal,
        action: "UPDATE",
        entity: "member_disabled",
        entityId: input.userId,
      });
      return { success: true as const };
    }),

  /** Reativa membro. */
  enable: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const manager = requireManager(ctx);
      const admin = getSupabaseAdmin();

      const { error } = await admin
        .from("organization_members")
        .update({ status: "active" })
        .eq("organization_id", manager.organizationId)
        .eq("user_id", input.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      const managerLocal = await localIdFor(manager.email);
      await writeAuditLog({
        organizationId: manager.organizationId,
        userId: managerLocal,
        action: "UPDATE",
        entity: "member_enabled",
        entityId: input.userId,
      });
      return { success: true as const };
    }),

  /** Catálogo de planos (público para a landing). */
  // (planos expostos em saas.plans abaixo)
});
