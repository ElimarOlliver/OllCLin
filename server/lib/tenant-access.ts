/**
 * OllCLin - Acesso a tenant (SaaS multi-tenant)
 *
 * Fase 1 do roadmap SaaS: a sessão passa a carregar o tenant ativo do usuário.
 * A resolução é feita em duas camadas:
 *   1. organization_members (status = 'active') — modelo SaaS oficial;
 *   2. fallback no vínculo legado users.organization_id (tenant único/dev).
 */

import { getSupabaseAdmin } from "./supabase-server";
import { findLocalUserByEmail } from "./supabase-auth";

export type TenantAccess = {
  organizationId: number;
  role: string;
};

/** Vínculo ativo mais recente de um usuário local na organização. */
export async function resolveTenantAccessByUserId(
  userId: number,
): Promise<TenantAccess | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_members")
    .select("organization_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ organization_id: number; role: string; status: string }>();

  if (error || !data) {
    // Fallback: vínculo legado em users (tenant único / desenvolvimento).
    const local = await getSupabaseAdmin()
      .from("users")
      .select("organization_id, role")
      .eq("id", userId)
      .limit(1)
      .maybeSingle<{ organization_id: number; role: string }>();

    if (local.error || !local.data) return null;
    const organizationId =
      typeof local.data.organization_id === "number"
        ? local.data.organization_id
        : Number(local.data.organization_id) || null;

    if (!organizationId) return null;
    return { organizationId, role: local.data.role ?? "assistant" };
  }

  const organizationId =
    typeof data.organization_id === "number"
      ? data.organization_id
      : Number(data.organization_id) || null;

  if (!organizationId) return null;
  return { organizationId, role: data.role ?? "assistant" };
}

/** Tenant ativo do usuário autenticado (pelo e-mail local). */
export async function resolveTenantAccessByEmail(
  email: string | null | undefined,
): Promise<TenantAccess | null> {
  const localUser = await findLocalUserByEmail(email);
  if (!localUser) return null;
  return resolveTenantAccessByUserId(localUser.id);
}
