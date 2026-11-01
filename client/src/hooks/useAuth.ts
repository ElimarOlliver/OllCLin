/**
 * OllCLin - Hook de Autenticação
 * Arquitetura MVC - Camada de lógica de negócio (cliente)
 *
 * Gerencia a sessão via Supabase Auth (JWT enviado como Bearer ao tRPC) e o
 * estado da query `auth.me`.
 */

import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { signOutSupabase } from "@/lib/supabase";

export function useAuth() {
  const utils = trpc.useUtils();
  const query = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
  });

  const logout = useCallback(async () => {
    try {
      await utils.client.auth.logout.mutate();
    } catch {
      // Sessão já inválida: segue para a tela inicial.
    }
    try {
      await signOutSupabase();
    } catch {
      // Sem sessão ativa no Supabase: segue para a tela inicial.
    }
    await utils.auth.me.invalidate();
    window.location.href = "/";
  }, [utils]);

  return {
    user: query.data ?? null,
    loading: query.isLoading,
    isAuthenticated: !!query.data,
    logout,
    refresh: query.refetch,
  };
}
