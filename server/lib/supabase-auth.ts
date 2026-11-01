/**
 * OllCLin - Autenticação via Supabase Auth (JWT access token)
 *
 * O frontend autentica com o Supabase Auth (email/senha ou magic link) e envia
 * o `access_token` JWT no header `Authorization: Bearer` das chamadas tRPC.
 * Aqui validamos o token no emissor (Supabase/GoTrue) e mapeamos o usuário
 * autenticado para o registro local (`users`, com `organization_id`).
 *
 * O usuário local de desenvolvimento (`ALLOW_DEV_AUTH`) continua valendo como
 * fallback para ambientes sem Supabase Auth configurado — e nunca em produção.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { User } from "../../drizzle/schema";
import { getSupabaseAdmin } from "./supabase-server";

export type SupabaseAuthUser = {
  /** sub do JWT do Supabase (auth.users.id) */
  id: string;
  email: string | null;
  name: string | null;
};

function getSupabaseAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!url || !key) {
    throw new Error("Supabase não configurado: defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Valida o access token do Supabase e devolve o usuário autenticado. */
export async function getSupabaseAuthUser(
  accessToken: string,
): Promise<SupabaseAuthUser | null> {
  if (!accessToken) return null;

  try {
    const supabase = getSupabaseAuthClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return null;

    const email = data.user.email ?? null;
    const name =
      (data.user.user_metadata?.name as string | undefined) ??
      (data.user.user_metadata?.full_name as string | undefined) ??
      email;

    return { id: data.user.id, email, name: name ?? null };
  } catch (error) {
    console.warn(
      "[Supabase Auth] Falha ao validar access token:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Busca o registro local do usuário pela e-mail (o `users` não guarda o id do
 * Supabase Auth; o vínculo é feito pelo e-mail + organização).
 */
export async function findLocalUserByEmail(email: string | null | undefined): Promise<User | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select(
      "id, open_id, name, email, login_method, role, organization_id, created_at, updated_at, last_signed_in",
    )
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle<Record<string, unknown>>();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;
  const organizationId =
    typeof row.organization_id === "number" ? row.organization_id : Number(row.organization_id) || null;

  const user = {
    id: Number(row.id),
    openId: String(row.open_id ?? ""),
    name: (row.name as string) ?? null,
    email: (row.email as string) ?? null,
    loginMethod: (row.login_method as string) ?? null,
    role: (row.role as string) ?? "user",
    organizationId,
    createdAt: row.created_at ? new Date(String(row.created_at)) : new Date(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)) : new Date(),
    lastSignedIn: row.last_signed_in ? new Date(String(row.last_signed_in)) : new Date(),
  } as unknown as User;

  return user;
}

/**
 * Fluxo completo: access token do Supabase -> usuário local autenticado.
 * Retorna `null` quando o token é inválido ou o e-mail não tem vínculo local.
 */
export async function resolveUserFromSupabaseAccessToken(
  accessToken: string,
): Promise<User | null> {
  const supabaseUser = await getSupabaseAuthUser(accessToken);
  if (!supabaseUser) return null;

  const localUser = await findLocalUserByEmail(supabaseUser.email);
  if (!localUser) return null;

  return localUser;
}
