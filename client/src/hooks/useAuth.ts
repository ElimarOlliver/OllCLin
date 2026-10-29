/**
 * OllCLin - Hook de Autenticação
 * Arquitetura MVC - Camada de lógica de negócio (cliente)
 *
 * Simplifica o acesso ao estado de autenticação via tRPC context.
 */

import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

export function useAuth() {
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const data = await trpc.auth.me.query();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  return {
    user: query.data,
    loading: query.isLoading,
    isAuthenticated: !!query.data,
    logout: async () => {
      await trpc.auth.logout.mutate();
      window.location.href = "/";
    },
  };
}

export { trpc };
