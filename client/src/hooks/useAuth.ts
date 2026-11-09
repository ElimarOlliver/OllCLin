/**
 * OllCLin - Hook de Autenticação
 * Arquitetura MVC - Camada de lógica de negócio (cliente)
 *
 * Gerencia a sessão via Supabase Auth (JWT enviado como Bearer ao tRPC) e o
 * estado da query `auth.me`.
 */

import { useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { signOutSupabase, supabase } from "@/lib/supabase";

export function useAuth() {
  const utils = trpc.useUtils();
  const query = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        utils.auth.me.setData(undefined, null);
        void utils.auth.me.invalidate();
      }
    });

    return () => data.subscription.unsubscribe();
  }, [utils]);

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
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
    window.location.replace("/entrar");
  }, [utils]);

  return {
    user: query.data ?? null,
    loading: query.isLoading,
    isAuthenticated: !!query.data,
    logout,
    refresh: query.refetch,
  };
}
