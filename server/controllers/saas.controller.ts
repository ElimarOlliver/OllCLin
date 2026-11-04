/**
 * OllCLin - Controller SaaS (cadastro público, trial e permissões)
 *
 * Camada Controller (MVC): validação Zod + regras de negócio + auditoria.
 *
 * Regras implementadas:
 * - O PRIMEIRO cadastro de uma conta é o TITULAR (owner, is_owner=true) e é o
 *   único com acesso master; cria organização própria com trial de 10 dias.
 * - Somente o titular vê e altera a página de Permissões (áreas do sistema por
 *   colaborador: none | partial | full).
 * - O titular não pode alterar as próprias permissões (ele sempre tem "*").
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as model from "../models/saas.model";
import { getSupabaseAdmin } from "../lib/supabase-server";
import { writeAuditLog } from "../lib/audit";
import type { TrpcContext } from "../_core/context";

const ACCESS_LEVELS = ["none", "partial", "full"] as const;
type AccessLevel = (typeof ACCESS_LEVELS)[number];

function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && (ACCESS_LEVELS as readonly string[]).includes(value);
}

/** Usuário local pelo e-mail (mesma resolução do supabase-auth). */
async function findLocalUserIdByEmail(email: string): Promise<number | null> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle<{ id: number }>();
  return data ? Number(data.id) : null;
}

const signupSchema = z.object({
  organizationName: z.string().min(2, "Informe o nome da clínica").max(120),
  name: z.string().min(2, "Informe seu nome").max(120),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres").max(72),
});

export const saasRouter = router({
  /** Catálogo de áreas de permissão (para a página Permissões). */
  permissionAreas: protectedProcedure.query(async () => {
    return model.listPermissionAreas();
  }),

  /**
   * Permissões de todos os membros da organização + estado do trial.
   * Somente o TITULAR acessa (área restrita da conta contratante).
   */
  permissionsOverview: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user!;
    if (!user.organizationId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem organização." });
    }

    const localId = await findLocalUserIdByEmail(user.email ?? "");
    const localUser = localId
      ? await getSupabaseAdmin()
        .from("users")
        .select("is_owner")
        .eq("id", localId)
        .maybeSingle<{ is_owner: boolean }>()
      : null;

    if (!localUser?.data?.is_owner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Área restrita ao titular da conta.",
      });
    }

    const [members, trial] = await Promise.all([
      model.listOrganizationMembersWithPermissions(user.organizationId),
      model.getOrganizationTrial(user.organizationId),
    ]);

    return { members, trial };
  }),

  /**
   * Ativa/desativa permissão (none|partial|full) de um colaborador numa área.
   * Somente o titular; titular não altera a si mesmo.
   */
  setPermission: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        areaKey: z.string().min(1),
        accessLevel: z.enum(ACCESS_LEVELS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user!;
      if (!user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem organização." });
      }

      const localId = await findLocalUserIdByEmail(user.email ?? "");
      const localUser = localId
        ? await getSupabaseAdmin()
          .from("users")
          .select("is_owner")
          .eq("id", localId)
          .maybeSingle<{ is_owner: boolean }>()
        : null;

      if (!localUser?.data?.is_owner) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Somente o titular da conta pode alterar permissões.",
        });
      }

      if (localId === input.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "O titular não pode alterar as próprias permissões.",
        });
      }

      // O alvo precisa ser membro da mesma organização.
      const { data: member } = await getSupabaseAdmin()
        .from("organization_members")
        .select("id")
        .eq("organization_id", user.organizationId)
        .eq("user_id", input.userId)
        .maybeSingle();

      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Usuário não pertence à sua organização.",
        });
      }

      if (!isAccessLevel(input.accessLevel)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nível de acesso inválido." });
      }

      await model.setMemberPermission({
        organizationId: user.organizationId,
        userId: input.userId,
        areaKey: input.areaKey,
        accessLevel: input.accessLevel,
        grantedBy: localId ?? 0,
      });

      await writeAuditLog({
        organizationId: user.organizationId,
        userId: localId,
        action: "UPDATE",
        entity: "member_permissions",
        entityId: input.userId,
        newValues: {
          targetUserId: input.userId,
          areaKey: input.areaKey,
          accessLevel: input.accessLevel,
        },
        request: (ctx as TrpcContext).req,
      });

      return { success: true as const };
    }),

  /** Estado do trial da organização do usuário logado. */
  trialStatus: protectedProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.user?.organizationId;
    if (!organizationId) return null;
    return model.getOrganizationTrial(organizationId);
  }),

  /** Catálogo público de planos (landing page). */
  plans: publicProcedure.query(async () => {
    const { listPlans } = await import("../models/provisioning.model");
    return listPlans();
  }),

  /**
   * Cadastro público (titular): cria usuário no Supabase Auth, organização com
   * trial de 10 dias, registro local e vínculos. O primeiro cadastro da conta
   * é sempre o titular (is_owner=true, role=owner).
   */
  signup: publicProcedure.input(signupSchema).mutation(async ({ input }) => {
    const email = input.email.trim().toLowerCase();

    // Já existe conta com este e-mail?
    const existing = await findLocalUserIdByEmail(email);
    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe uma conta com este e-mail. Faça login.",
      });
    }

    const admin = getSupabaseAdmin();

    // 1. Usuário no Supabase Auth (e-mail confirmado — sem verificação por
    //    e-mail neste fluxo inicial; produção pode exigir confirmação).
    const authClient = (await import("@supabase/supabase-js")).createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "",
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );

    const { error: authError } = await authClient.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name, full_name: input.name },
    });

    if (authError) {
      const msg = authError.message ?? String(authError);
      if (!/already|registered|exists/i.test(msg)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }

    // 2. Organização com trial de 10 dias
    const { organizationId } = await model.createOrganizationWithTrial({
      name: input.organizationName.trim(),
    });

    // 3. Registro local (users) — titular
    const { data: maxRow } = await admin
      .from("users")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    const nextUserId = Number(maxRow?.[0]?.id ?? 0) + 1;

    const { data: localUser, error: userError } = await admin
      .from("users")
      .insert({
        id: nextUserId,
        open_id: `supabase:${email}`,
        name: input.name.trim(),
        email,
        login_method: "supabase",
        role: "owner",
        organization_id: organizationId,
        is_owner: true,
      })
      .select("id")
      .single<{ id: number }>();

    if (userError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: userError.message });

    // 4. Vínculo organization_members (owner/active)
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: localUser.id,
      role: "owner",
      status: "active",
    });

    if (memberError) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: memberError.message });
    }

    await writeAuditLog({
      organizationId,
      userId: localUser.id,
      action: "CREATE",
      entity: "organizations",
      entityId: organizationId,
      newValues: { email, trialDays: 10 },
    });

    return {
      success: true as const,
      organizationId,
      trialDays: 10,
      message:
        "Conta criada! Você tem 10 dias grátis. Faça login para acessar seu painel.",
    };
  }),
});
