/**
 * OllCLin - Supabase Server SDK (Backend)
 * Arquitetura MVC - Camada de integração com Supabase (lado servidor)
 *
 * IMPORTANTE (LGPD): a SUPABASE_SECRET_KEY (service role) só pode ser usada no
 * backend. Ela ignora RLS e nunca deve chegar ao navegador.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";
import { ENV } from "../_core/env";

let adminClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(ENV.supabaseUrl && ENV.supabaseServiceKey);
}

/**
 * Cliente administrativo (service role). Uso exclusivo no backend.
 * Ignora RLS - por isso todo acesso deve filtrar organization_id.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceKey) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_SECRET_KEY no .env",
    );
  }

  if (!adminClient) {
    adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return adminClient;
}

/** Cliente público (chave publishable/anon) - respeita RLS. */
export function getSupabasePublic(): SupabaseClient {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no .env",
    );
  }

  if (!publicClient) {
    publicClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return publicClient;
}

/** Extrai o token Bearer do header Authorization (ou cookie de sessão). */
function getAccessToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.sb_access_token ?? null;
}

/**
 * Valida o JWT do Supabase e retorna o usuário autenticado (ou null).
 * Útil quando a autenticação passar a ser feita pelo Supabase Auth.
 */
export async function getSupabaseUser(req: Request, _res: Response) {
  const token = getAccessToken(req);
  if (!token) return null;

  const { data, error } = await getSupabasePublic().auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

/** Testa a conexão com o banco (usado pelo endpoint /api/health/db). */
export async function checkSupabaseConnection(): Promise<{
  ok: boolean;
  message: string;
  organizations?: number;
}> {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true });

    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: "Conexão com o Supabase estabelecida",
      organizations: count ?? 0,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}
