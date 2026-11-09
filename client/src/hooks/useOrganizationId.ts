/**
 * OllCLin - Tenant ativo da sessão (cliente)
 *
 * O servidor rejeita qualquer `organizationId` diferente do vínculo do usuário
 * (ver `requireTenantScope` em server/_core/trpc.ts). Este hook garante que a
 * UI peça sempre o tenant correto em vez de um id fixo.
 *
 * Fallback 1 apenas para o modo de desenvolvimento (ALLOW_DEV_AUTH=true).
 */

import { useAuth } from "@/hooks/useAuth";

export function useOrganizationId(): number {
  const { user } = useAuth();
  return user?.organizationId ?? 1;
}
