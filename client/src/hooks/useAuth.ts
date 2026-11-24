/**
 * OllCLin - Hook de Autenticação
 * Arquitetura MVC - Camada de lógica de negócio (cliente)
 *
 * Gerencia a sessão via Supabase Auth (JWT enviado como Bearer ao tRPC) e o
 * estado da query `auth.me`.
 */

import { useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { consumeUrlSession, signOutSupabase, supabase } from "@/lib/supabase";

export function useAuth() {
  const utils = trpc.useUtils();
  const query = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
  });

  // Callback OAuth/magic link: consome o token da URL e limpa a query/hash
  // imediatamente (token nunca permanece visível na barra de endereço).
  useEffect(() => {
    void consumeUrlSession();
  }, []);

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
    // LGPD: sai de todos os storages — nada de sessão/usuario sobrevive ao
    // logout neste navegador (inclui rastro legado do template Manus).
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // storage bloqueado (navegação privada)
    }
    // Token de sessão nunca pode trafegar/permancer em URL visível.
    try {
      window.history.replaceState(null, "", "/entrar");
    } catch {
      // replaceState indisponível
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
