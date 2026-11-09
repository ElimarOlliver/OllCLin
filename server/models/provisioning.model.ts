/**
 * OllCLin - Model de Provisionamento de Tenant (pós-pagamento)
 *
 * Camada Model (MVC): acesso ao Supabase para:
 * - organizations (status/plan/gateway/onboarding)
 * - organization_members (fonte oficial do vínculo e papel)
 * - account_invitations (tokens hashados, uso único)
 * - saas_plans (catálogo de planos)
 * - payment_webhook_events (idempotência de webhooks — já existia na 0009)
 *
 * Regras: nunca apagar dados; suspensão apenas muda status.
 */

import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase-server";

export type OrganizationStatus = "trial" | "active" | "suspended" | "canceled";

export type SaasPlan = {
  key: string;
  name: string;
  priceCents: number;
  maxUsers: number;
  features: string[];
};

export type Invitation = {
  id: number;
  organizationId: number;
  email: string;
  role: string;
  type: string;
  expiresAt: string;
  usedAt: string | null;
};

/** Hash SHA-256 do token — o token puro nunca é persistido. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Gera token de 32 bytes aleatórios (URL-safe). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/* ------------------------------ planos ---------------------------------- */

export async function listPlans(): Promise<SaasPlan[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("saas_plans")
    .select("key, name, price_cents, max_users, features")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`saas_plans: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    key: String(row.key),
    name: String(row.name),
    priceCents: Number(row.price_cents),
    maxUsers: Number(row.max_users),
    features: Array.isArray(row.features) ? (row.features as string[]) : [],
  }));
}

/* --------------------------- organização -------------------------------- */

export async function findOrganizationByGatewayRef(
  gatewayCustomerId: string | null,
  subscriptionId: string | null,
): Promise<{ id: number; status: string; plan_key: string | null } | null> {
  if (!gatewayCustomerId && !subscriptionId) return null;
  const admin = getSupabaseAdmin();
  let query = admin.from("organizations").select("id, status, plan_key");
  if (subscriptionId) query = query.eq("gateway_subscription_id", subscriptionId);
  else query = query.eq("gateway_customer_id", gatewayCustomerId!);
  const { data } = await query.limit(1).maybeSingle();
  return (data as { id: number; status: string; plan_key: string | null } | null) ?? null;
}

export async function createProvisionedOrganization(input: {
  name: string;
  email: string | null;
  planKey: string;
  provider: string;
  gatewayCustomerId: string | null;
  gatewaySubscriptionId: string | null;
}): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .insert({
      name: input.name,
      email: input.email,
      is_active: true,
      status: "active",
      plan: "paid",
      plan_key: input.planKey,
      payment_provider: input.provider,
      gateway_customer_id: input.gatewayCustomerId,
      gateway_subscription_id: input.gatewaySubscriptionId,
    })
    .select("id")
    .single<{ id: number }>();
  if (error) throw new Error(`organizations: ${error.message}`);
  return Number(data.id);
}

export async function setOrganizationStatus(
  organizationId: number,
  status: OrganizationStatus,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("organizations")
    .update({ status })
    .eq("id", organizationId);
  if (error) throw new Error(`organizations: ${error.message}`);
}

export async function findOrganizationByEmail(email: string): Promise<{ id: number; name: string } | null> {
  const { data } = await getSupabaseAdmin()
    .from("organizations")
    .select("id, name")
    .ilike("email", email)
    .limit(1)
    .maybeSingle<{ id: number; name: string }>();
  return data ?? null;
}

/* ----------------------------- usuários --------------------------------- */

export async function findLocalUserIdByEmail(email: string): Promise<number | null> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle<{ id: number }>();
  return data ? Number(data.id) : null;
}

/** Próximo id de users (a coluna não tem auto-increment no Postgres). */
export async function nextUserId(): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("id")
    .order("id", { ascending: false })
    .limit(1);
  return Number(data?.[0]?.id ?? 0) + 1;
}

export async function createLocalUser(input: {
  email: string;
  name: string;
  organizationId: number;
  role: string;
  isOwner: boolean;
}): Promise<number> {
  const id = await nextUserId();
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .insert({
      id,
      open_id: `supabase:${input.email.toLowerCase()}`,
      name: input.name,
      email: input.email.toLowerCase(),
      login_method: "supabase",
      role: input.role,
      organization_id: input.organizationId,
      is_owner: input.isOwner,
    })
    .select("id")
    .single<{ id: number }>();
  if (error) throw new Error(`users: ${error.message}`);
  return Number(data.id);
}

export async function upsertMembership(input: {
  organizationId: number;
  userId: number;
  role: string;
  status: string;
  invitedBy?: number | null;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("organization_members")
    .upsert(
      {
        organization_id: input.organizationId,
        user_id: input.userId,
        role: input.role,
        status: input.status,
        invited_by: input.invitedBy ?? null,
      },
      { onConflict: "organization_id,user_id" },
    );
  if (error) throw new Error(`organization_members: ${error.message}`);
}

export type OrganizationMemberWithPermissions = {
  userId: number;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  isOwner: boolean;
  permissions: Record<string, string>;
};

/**
 * Lista os membros da organização com dados do usuário e as permissões
 * granulares por área (member_permissions). Usado pela tela Equipe.
 */
export async function listOrganizationMembersWithPermissions(
  organizationId: number,
): Promise<OrganizationMemberWithPermissions[]> {
  const admin = getSupabaseAdmin();

  const { data: members, error } = await admin
    .from("organization_members")
    .select("user_id, role, status")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`organization_members: ${error.message}`);

  const rows = members ?? [];
  if (rows.length === 0) return [];

  const userIds = rows.map((row) => Number(row.user_id));

  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, name, email, is_owner")
    .in("id", userIds);
  if (usersError) throw new Error(`users: ${usersError.message}`);

  const { data: permissions, error: permissionsError } = await admin
    .from("member_permissions")
    .select("user_id, area_key, access_level")
    .eq("organization_id", organizationId)
    .in("user_id", userIds);
  if (permissionsError) throw new Error(`member_permissions: ${permissionsError.message}`);

  const usersById = new Map<number, Record<string, unknown>>();
  for (const user of users ?? []) usersById.set(Number(user.id), user);

  const permissionsByUser = new Map<number, Record<string, string>>();
  for (const permission of permissions ?? []) {
    const userId = Number(permission.user_id);
    const current = permissionsByUser.get(userId) ?? {};
    current[String(permission.area_key)] = String(permission.access_level);
    permissionsByUser.set(userId, current);
  }

  return rows.map((row) => {
    const userId = Number(row.user_id);
    const user = usersById.get(userId);
    return {
      userId,
      name: user?.name ? String(user.name) : null,
      email: user?.email ? String(user.email) : null,
      role: String(row.role),
      status: String(row.status),
      isOwner: user?.is_owner === true,
      permissions: permissionsByUser.get(userId) ?? {},
    };
  });
}

/* ---------------------------- convites ----------------------------------- */

export async function createInvitation(input: {
  organizationId: number;
  email: string;
  role: string;
  type: "owner_activation" | "staff_invite";
  expiresAt: Date;
  invitedBy: number | null;
  tokenHash: string;
}): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("account_invitations")
    .insert({
      organization_id: input.organizationId,
      email: input.email.toLowerCase(),
      role: input.role,
      type: input.type,
      token_hash: input.tokenHash,
      expires_at: input.expiresAt.toISOString(),
      invited_by: input.invitedBy,
    })
    .select("id")
    .single<{ id: number }>();
  if (error) throw new Error(`account_invitations: ${error.message}`);
  return Number(data.id);
}

/** Busca convite válido por hash (não expirado, não usado). */
export async function findValidInvitationByHash(
  tokenHash: string,
): Promise<(Invitation & { organizationName: string }) | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("account_invitations")
    .select("id, organization_id, email, role, type, expires_at, used_at, organizations!inner(name)")
    .eq("token_hash", tokenHash)
    .limit(1)
    .maybeSingle<Record<string, unknown>>();

  if (error || !data) return null;

  const invitation: Invitation & { organizationName: string } = {
    id: Number(data.id),
    organizationId: Number(data.organization_id),
    email: String(data.email),
    role: String(data.role),
    type: String(data.type),
    expiresAt: String(data.expires_at),
    usedAt: data.used_at ? String(data.used_at) : null,
    organizationName: String((data.organizations as Record<string, unknown>)?.name ?? ""),
  };

  if (invitation.usedAt) return null; // uso único
  if (new Date(invitation.expiresAt).getTime() < Date.now()) return null; // expirado
  return invitation;
}

export async function markInvitationUsed(invitationId: number): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("account_invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invitationId)
    .is("used_at", null); // defesa extra: só se ainda não usado
  if (error) throw new Error(`account_invitations: ${error.message}`);
}

/* ------------------------- webhooks (idempotência) ----------------------- */

/** Registra evento de webhook; false se já existia (dedupe). */
export async function recordWebhookEventOnce(input: {
  provider: string;
  eventId: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("payment_webhook_events")
    .insert({
      organization_id: null, // resolvido após o provisionamento (webhook de assinatura)
      provider_name: input.provider,
      event_id: input.eventId,
      payload: input.payload,
    });

  if (error) {
    // Duplicado (unique provider_name+event_id) → já processado
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) return false;
    throw new Error(`payment_webhook_events: ${error.message}`);
  }
  return true;
}
