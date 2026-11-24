import { getSupabaseAuthHeaders, trpc } from "@/lib/trpc";
import { TRIAL_EXPIRED_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  if (window.location.pathname !== "/entrar") {
    window.location.replace("/entrar");
    return;
  }

  if (window.__MANUS_CONFIG__?.oauthPortalUrl) startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    // Trial expirado: abre o popup de contratação onde a mutação falhou.
    if (error instanceof TRPCClientError && error.message === TRIAL_EXPIRED_ERR_MSG) {
      window.dispatchEvent(new CustomEvent("ollclin:trial-expired"));
    }
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        // O login principal usa Supabase Auth. Ele deve ter prioridade sobre
        // um cookie Manus antigo que possa ter ficado no sessionStorage.
        // Auto-login indevido: o cookie Manus herdado do template (`webdev_app_session`)
        // é só do ambiente Manus Preview — no SaaS real a sessão é o JWT do Supabase
        // enviado como Bearer. Enviar esse cookie legado autenticava qualquer
        // visitante novo com a conta dona do cookie (auto-login compartilhado).
        try {
          if (sessionStorage.getItem("manus-cookie")) sessionStorage.removeItem("manus-cookie");
        } catch {
          // sessionStorage indisponível
        }
        const supabaseHeaders = await getSupabaseAuthHeaders();
        if (supabaseHeaders.Authorization) return supabaseHeaders;

        // Nunca mais espelhamos a sessão em sessionStorage: token em storage é
        // visível a qualquer script XSS e sobrevive à navegação aberta por
        // terceiros — a sessão passa a viver só no Supabase Auth.
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
