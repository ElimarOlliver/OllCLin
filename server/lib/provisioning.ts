/**
 * OllCLin - Serviço de Provisionamento de Tenant (pós-pagamento)
 *
 * Chamado pelo webhook do gateway quando um pagamento/assinatura é confirmado:
 *   1. org existente (mesma assinatura) → reativa; senão cria nova org 'active'
 *   2. e-mail do comprador: existe → vincula como owner; senão cria usuário
 *   3. gera convite 'owner_activation' (hash SHA-256, expira em 72h) e envia
 *      e-mail com link /primeiro-acesso?token=...
 *   4. auditoria TENANT_PROVISIONED
 *
 * Pagamento falho/cancelado → status 'suspended' (nunca apaga dados).
 * NUNCA gera nem envia senha por e-mail.
 */

import { PUBLIC_URL_FALLBACK } from "./public-url";
import * as model from "../models/provisioning.model";
import { writeAuditLog } from "./audit";
import { getEmailService } from "./email";

export type ProvisionInput = {
  provider: string;
  eventId: string;
  /** E-mail do comprador (vem do payload do gateway). */
  buyerEmail: string;
  buyerName?: string | null;
  /** Nome da clínica (payload do checkout ou derivado do e-mail). */
  organizationName?: string | null;
  planKey: string;
  gatewayCustomerId?: string | null;
  gatewaySubscriptionId?: string | null;
};

export type ProvisionResult = {
  organizationId: number;
  created: boolean;
  invitationSent: boolean;
};

/** Horas de validade dos links (72h conforme decisão do produto). */
export const INVITE_EXPIRY_HOURS = 72;

export async function provisionTenant(input: ProvisionInput, req?: unknown): Promise<ProvisionResult> {
  const email = input.buyerEmail.trim().toLowerCase();

  // 1. Org existente para a mesma assinatura? → reativa. Senão cria.
  let organizationId: number;
  let created = false;

  const existing = await model.findOrganizationByGatewayRef(
    input.gatewayCustomerId ?? null,
    input.gatewaySubscriptionId ?? null,
  );

  if (existing) {
    await model.setOrganizationStatus(existing.id, "active");
    organizationId = existing.id;
  } else {
    const orgName =
      input.organizationName?.trim() ||
      input.buyerName?.trim() ||
      email.split("@")[0].replace(/[._-]/g, " ");
    organizationId = await model.createProvisionedOrganization({
      name: orgName,
      email,
      planKey: input.planKey,
      provider: input.provider,
      gatewayCustomerId: input.gatewayCustomerId ?? null,
      gatewaySubscriptionId: input.gatewaySubscriptionId ?? null,
    });
    created = true;
  }

  // 2. Usuário owner: existe → vincula; senão cria registro local.
  let localUserId = await model.findLocalUserIdByEmail(email);
  if (localUserId) {
    await model.upsertMembership({
      organizationId,
      userId: localUserId,
      role: "owner",
      status: "active",
    });
  } else {
    localUserId = await model.createLocalUser({
      email,
      name: input.buyerName?.trim() || email.split("@")[0],
      organizationId,
      role: "owner",
      isOwner: true,
    });
    await model.upsertMembership({
      organizationId,
      userId: localUserId,
      role: "owner",
      status: "active",
    });
  }

  // 3. Convite owner_activation + e-mail com link /primeiro-acesso
  const token = model.generateToken();
  const tokenHash = model.hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 3_600_000);

  await model.createInvitation({
    organizationId,
    email,
    role: "owner",
    type: "owner_activation",
    expiresAt,
    invitedBy: localUserId,
    tokenHash,
  });

  const base = process.env.PUBLIC_URL || PUBLIC_URL_FALLBACK;
  const linkUrl = `${base}/primeiro-acesso?token=${encodeURIComponent(token)}`;

  let invitationSent = false;
  try {
    const org = created ? { name: input.organizationName ?? "" } : null;
    await getEmailService().sendInvitationEmail({
      to: email,
      linkUrl,
      organizationName: org?.name ?? "",
      role: "owner",
      expiresInHours: INVITE_EXPIRY_HOURS,
    });
    invitationSent = true;
  } catch (error) {
    // Não falha o provisionamento se o e-mail falhar: o link fica válido e
    // pode ser reenviado pela equipe de suporte.
    console.error(
      "[Provisionamento] Falha ao enviar e-mail de ativação:",
      error instanceof Error ? error.message : error,
    );
  }

  // 4. Auditoria
  await writeAuditLog({
    organizationId,
    userId: localUserId,
    action: "CREATE",
    entity: "tenant_provisioning",
    entityId: organizationId,
    newValues: {
      provider: input.provider,
      eventId: input.eventId,
      planKey: input.planKey,
      created,
      invitationSent,
      expiresAt: expiresAt.toISOString(),
    },
    request: (req as import("express").Request) ?? undefined,
  });

  return { organizationId, created, invitationSent };
}

/** Pagamento falho/cancelado/chargeback → suspende (sem apagar dados). */
export async function suspendTenantByGatewayRef(
  gatewayCustomerId: string | null,
  gatewaySubscriptionId: string | null,
  reason: string,
  req?: unknown,
): Promise<boolean> {
  const org = await model.findOrganizationByGatewayRef(gatewayCustomerId, gatewaySubscriptionId);
  if (!org) return false;
  await model.setOrganizationStatus(org.id, "suspended");
  await writeAuditLog({
    organizationId: org.id,
    action: "UPDATE",
    entity: "tenant_suspension",
    entityId: org.id,
    newValues: { status: "suspended", reason },
    request: (req as import("express").Request) ?? undefined,
  });
  return true;
}
