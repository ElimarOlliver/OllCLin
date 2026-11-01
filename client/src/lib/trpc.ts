import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";
import { httpBatchLink } from "@trpc/client";
import { supabase, getSupabaseSession } from "./supabase";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

// O tRPC client envia o access token do Supabase Auth (quando houver sessão)
// via header Authorization: Bearer; o backend valida o JWT em /api/trpc.
export async function getSupabaseAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await getSupabaseSession();
  const accessToken = data.session?.access_token;
  if (accessToken) return { Authorization: `Bearer ${accessToken}` };
  return {};
}
