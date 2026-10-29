/**
 * OllCLin - Supabase Server SDK (Backend)
 * Arquitetura MVC - Camada de integração com Supabase (lado servidor)
 *
 * Este arquivo cria o cliente Supabase com privilégios de servidor (service role),
 * permitindo operações que contornam o RLS (Row Level Security) quando necessário.
 * Use apenas no backend, nunca expõe a SUPABASE_SECRET_KEY ao frontend.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { Express } from "express";
import { ENV } from "../_core/env";

/**
 * Cria um cliente Supabase autenticado com cookies de sessão do Express.
 * Ideal para usar dentro de middlewares tRPC ou rotas Express.
 */
export function createSupabaseServerClient(req: Express.Request, res: Express.Response) {
  const supabaseUrl = ENV.supabaseUrl;
  const supabaseKey = ENV.supabaseAnonKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase não configurado: defina SUPABASE_URL e SUPABASE_ANON_KEY no .env",
    );
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return req.cookies?.[name];
      },
      set(name: string, value: string, options: CookieOptions) {
        res.cookie(name, value, {
          ...options,
          path: options.path ?? "/",
          sameSite: options.sameSite ?? "lax",
          secure: options.secure ?? process.env.NODE_ENV === "production",
        });
      },
      remove(name: string, options: CookieOptions) {
        res.clearCookie(name, {
          ...options,
          path: options.path ?? "/",
        });
      },
    },
  });
}

/**
 * Cria um cliente Supabase com chave de serviço (service role).
 * USE APENAS NO BACKEND para operações administrativas que ignoram RLS.
 * Nunca exponha esta chave ao navegador.
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = ENV.supabaseUrl;
  const supabaseServiceKey = ENV.supabaseServiceKey;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "Supabase Admin não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env",
    );
  }

  return createServerClient(supabaseUrl, supabaseServiceKey, {
    cookies: {
      get() { return undefined; },
      set() { /* no-op */ },
      remove() { /* no-op */ },
    },
  });
}

/**
 * Verifica o JWT do Supabase a partir do cookie de sessão.
 * Retorna o usuário autenticado ou null.
 */
export async function getSupabaseUser(req: Express.Request, res: Express.Response) {
  const supabase = createSupabaseServerClient(req, res);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}
