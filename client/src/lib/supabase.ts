/**
 * OllCLin - Configuração do Supabase
 * Arquitetura MVC - Camada de integração com banco de dados
 *
 * Conexão com Supabase (PostgreSQL) para persistência de dados.
 * Substitui/expande o MySQL existente via Drizzle ORM.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados. " +
      "Crie um arquivo .env com estas variáveis.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Sessão persistida no localStorage do navegador; o token é enviado ao
    // backend (tRPC) via header Authorization: Bearer, que o server valida.
    persistSession: true,
    autoRefreshToken: true,
    // detectSessionInUrl consome hash/query (magic link / OAuth implicit) e
    // depois remove da URL via history.replaceState.
    detectSessionInUrl: true,
  },
});

/**
 * Consumo do token que veio na URL (callback OAuth / magic link).
 * Após ler a sessão, a URL é limpa imediatamente: token de sessão
 * nunca pode permanecer visível em query string ou hash fragment.
 */
export async function consumeUrlSession(): Promise<void> {
  if (typeof window === "undefined") return;
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

/** Sessão atual do Supabase Auth (null quando deslogado). */
export async function getSupabaseSession() {
  return supabase.auth.getSession();
}

/** Login com e-mail/senha (Supabase Auth). */
export async function signInWithEmailPassword(params: {
  email: string;
  password: string;
}): Promise<{
  data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"];
  error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["error"];
}> {
  return supabase.auth.signInWithPassword(params);
}

/** Encerra a sessão do Supabase Auth. */
export async function signOutSupabase(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Helper para executar queries com tratamento de erro padronizado
 */
export async function supabaseQuery<T>(
  promise: Promise<{ data: T | null; error: any }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    console.error("[Supabase] Erro na consulta:", error.message);
    throw new Error(error.message || "Erro ao consultar o Supabase");
  }
  return data as T;
}

/**
 * Tipo para sessão do Supabase Auth
 */
export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    user_metadata: Record<string, unknown>;
  };
};

/**
 * Tipo para perfil de usuário no Supabase
 */
export type SupabaseProfile = {
  id: string;
  email: string;
  full_name: string;
  organization_id: number;
  role: string;
  created_at: string;
};
