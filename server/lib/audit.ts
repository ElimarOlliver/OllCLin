/**
 * OllCLin - Trilha de auditoria (LGPD)
 * Registra quem acessou/alterou dados sensíveis.
 *
 * A gravação é "best effort": uma falha de auditoria não deve derrubar a
 * operação clínica, mas fica registrada no console do servidor.
 */

import type { Request } from "express";
import { getSupabaseAdmin } from "./supabase-server";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "READ" | "CANCEL" | "LOGIN";

export type AuditEntry = {
  organizationId?: number | null;
  userId?: number | null;
  action: AuditAction;
  entity: string;
  entityId?: number | null;
  oldValues?: unknown;
  newValues?: unknown;
  request?: Request;
};

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const forwarded = entry.request?.headers["x-forwarded-for"];
    const ipAddress =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ??
      entry.request?.ip ??
      null;

    const { error } = await getSupabaseAdmin()
      .from("audit_log")
      .insert({
        organization_id: entry.organizationId ?? null,
        user_id: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entity_id: entry.entityId ?? null,
        old_values: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        new_values: entry.newValues ? JSON.stringify(entry.newValues) : null,
        ip_address: ipAddress,
        user_agent: entry.request?.headers["user-agent"] ?? null,
      });

    if (error) {
      console.error("[Audit] Falha ao registrar auditoria:", error.message);
    }
  } catch (error) {
    console.error(
      "[Audit] Falha ao registrar auditoria:",
      error instanceof Error ? error.message : error,
    );
  }
}
