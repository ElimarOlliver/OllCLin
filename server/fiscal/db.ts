/**
 * OllCLin — Helper obrigatório de acesso a dados fiscais (FISCAL.md §4, R02).
 *
 * NENHUMA query fiscal roda sem filtro de organizationId. Proibido
 * `db.select().from(notasFiscais)` solto — o filtro explícito
 * `eq(tabela.organizationId, tenantId)` é digitado em cada chamada, e esta
 * função valida o argumento antes.
 *
 * MySQL não tem RLS do Postgres (R03 adaptado): esta camada É a barreira
 * de isolamento de tenant, junto com a verificação no router tRPC.
 */

/** Valida o tenant antes de qualquer operação fiscal. Falha rápido. */
export function exigirTenantId(organizationId: unknown): number {
  if (typeof organizationId !== "number" || !Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error("Escopo de tenant ausente ou inválido em operação fiscal");
  }
  return organizationId;
}
