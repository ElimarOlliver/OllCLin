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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
