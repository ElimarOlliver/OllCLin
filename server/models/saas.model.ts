/**
 * OllCLin - Model SaaS (Fase SaaS: contas, trial e permissões)
 *
 * Camada Model (MVC): acesso exclusivo ao Supabase (PostgreSQL). Nenhuma regra
 * de negócio aqui — apenas leitura/escrita de dados. As tabelas envolvidas:
 *
 * - organizations (trial_started_at / trial_ends_at / plan)
 * - users (is_owner: somente o primeiro cadastro da conta é titular)
 * - organization_members (vínculo papel/status)
 * - permission_areas + member_permissions (permissões granulares)
 */

import { getSupabaseAdmin } from "../lib/supabase-server";

export type PermissionArea = {
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
};

export type MemberPermission = {
  userId: number;
  areaKey: string;
  accessLevel: "none" | "partial" | "full";
  updatedAt: string | null;
};

export type MemberWithPermissions = {
  userId: number;
  name: string | null;
  email: string | null;
  isOwner: boolean;
  role: string;
  status: string;
  permissions: MemberPermission[];
};

export type OrganizationTrial = {
  organizationId: number;
  name: string;
  plan: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  trialExpired: boolean;
};

const TRIAL_DAYS = 10;

/** Lista todas as áreas de permissão do catálogo. */
export async function listPermissionAreas(): Promise<PermissionArea[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("permission_areas")
    .select("key, label, description, sort_order")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`permission_areas: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    key: String(row.key),
    label: String(row.label),
    description: (row.description as string) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
  }));
}

/** Permissões efetivas de um usuário numa organização. */
export async function listMemberPermissions(
  organizationId: number,
  userId: number,
): Promise<MemberPermission[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("member_permissions")
    .select("user_id, area_key, access_level, updated_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);

  if (error) throw new Error(`member_permissions: ${error.message}`);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    userId: Number(row.user_id),
    areaKey: String(row.area_key),
    accessLevel: (row.access_level as MemberPermission["accessLevel"]) ?? "none",
    updatedAt: (row.updated_at as string) ?? null,
  }));
}

/** Permissões de todos os membros da organização (mapa userId -> perms). */
export async function listOrganizationMembersWithPermissions(
  organizationId: number,
): Promise<MemberWithPermissions[]> {
  const admin = getSupabaseAdmin();

  const { data: members, error: membersError } = await admin
    .from("organization_members")
    .select("user_id, role, status, users!inner(id, name, email, is_owner)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (membersError) throw new Error(`organization_members: ${membersError.message}`);

  const memberRows = (members ?? []) as unknown as Array<
    Record<string, unknown> & { users: Record<string, unknown> }
  >;

  const userIds = memberRows.map((m) => Number(m.user_id));

  const { data: perms, error: permsError } = await admin
    .from("member_permissions")
    .select("user_id, area_key, access_level, updated_at")
    .eq("organization_id", organizationId);

  if (permsError) throw new Error(`member_permissions: ${permsError.message}`);

  const permsByUser = new Map<number, MemberPermission[]>();
  for (const row of (perms ?? []) as Array<Record<string, unknown>>) {
    const uid = Number(row.user_id);
    const list = permsByUser.get(uid) ?? [];
    list.push({
      userId: uid,
      areaKey: String(row.area_key),
      accessLevel: (row.access_level as MemberPermission["accessLevel"]) ?? "none",
      updatedAt: (row.updated_at as string) ?? null,
    });
    permsByUser.set(uid, list);
  }

  return memberRows.map((m) => ({
    userId: Number(m.user_id),
    name: (m.users?.name as string) ?? null,
    email: (m.users?.email as string) ?? null,
    isOwner: Boolean(m.users?.is_owner),
    role: String(m.role ?? "assistant"),
    status: String(m.status ?? "active"),
    permissions: permsByUser.get(Number(m.user_id)) ?? [],
  }));
}

/** Grava (upsert) o nível de acesso de um usuário numa área. */
export async function setMemberPermission(input: {
  organizationId: number;
  userId: number;
  areaKey: string;
  accessLevel: "none" | "partial" | "full";
  grantedBy: number;
}): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("member_permissions")
    .upsert(
      {
        organization_id: input.organizationId,
        user_id: input.userId,
        area_key: input.areaKey,
        access_level: input.accessLevel,
        granted_by: input.grantedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,user_id,area_key" },
    );

  if (error) throw new Error(`member_permissions: ${error.message}`);
}

/** Estado do trial (10 dias) da organização. */
export async function getOrganizationTrial(
  organizationId: number,
): Promise<OrganizationTrial | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("id, name, plan, trial_started_at, trial_ends_at")
    .eq("id", organizationId)
    .maybeSingle<Record<string, unknown>>();

  if (error) throw new Error(`organizations: ${error.message}`);
  if (!data) return null;

  const trialEndsAt = (data.trial_ends_at as string) ?? null;
  const trialStartedAt = (data.trial_started_at as string) ?? null;

  let trialDaysLeft: number | null = null;
  let trialExpired = false;
  if (trialEndsAt) {
    const diffMs = new Date(trialEndsAt).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(diffMs / 86_400_000));
    trialExpired = diffMs <= 0;
  }

  return {
    organizationId: Number(data.id),
    name: String(data.name ?? ""),
    plan: String(data.plan ?? "trial"),
    trialStartedAt,
    trialEndsAt,
    trialDaysLeft,
    trialExpired,
  };
}

/** Cria a organização com trial de 10 dias a partir de agora. */
export async function createOrganizationWithTrial(input: {
  name: string;
}): Promise<{ organizationId: number }> {
  const now = new Date();
  const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);

  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .insert({
      name: input.name,
      is_active: true,
      plan: "trial",
      trial_started_at: now.toISOString(),
      trial_ends_at: ends.toISOString(),
    })
    .select("id")
    .single<{ id: number }>();

  if (error) throw new Error(`organizations: ${error.message}`);
  return { organizationId: Number(data.id) };
}
