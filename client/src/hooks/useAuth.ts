/**
 * OllCLin - Hook de Autenticação
 * Arquitetura MVC - Camada de lógica de negócio (cliente)
 *
 * Simplifica o acesso ao estado de autenticação via tRPC context.
 */

import { trpc } from "@/lib/trpc";

export function useAuth() {
  const utils = trpc.useUtils();
  const query = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
  });

  return {
    user: query.data ?? null,
    loading: query.isLoading,
    isAuthenticated: !!query.data,
    logout: async () => {
      try {
        await utils.client.auth.logout.mutate();
      } catch {
        // Sessão já inválida: segue para a tela inicial.
      }
      window.location.href = "/";
    },
  };
}

export { trpc };
