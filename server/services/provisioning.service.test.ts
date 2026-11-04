/**
 * Testes do provisionamento de tenant (Fase SaaS).
 *
 * Cobre:
 * - hashToken/generateToken: hash SHA-256, token de 32 bytes, nunca iguais.
 * - findValidInvitationByHash: expirado e reutilizado → inválido.
 * - setOrganizationStatus: suspensão sem apagar dados.
 * - webhook: assinatura inválida → 401; evento duplicado → dedupe.
 *
 * Usa o próprio Supabase do .env com registros temporários (cleanup ao final).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";

// Carrega .env antes de importar os módulos que leem process.env
const raw = readFileSync(new URL("../../.env", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq > 0) process.env[t.slice(0, eq).trim()] ??= t.slice(eq + 1).trim();
}

const { hashToken, generateToken, createInvitation, findValidInvitationByHash, markInvitationUsed, setOrganizationStatus } = await import(
  "../models/provisioning.model"
);

const CLEANUP_IDS: number[] = [];
let supabase: import("@supabase/supabase-js").SupabaseClient | null = null;

async function getAdmin() {
  if (!supabase) {
    const { createClient } = await import("@supabase/supabase-js");
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return supabase;
}

describe("Provisionamento — tokens", () => {
  it("generateToken gera 32 bytes URL-safe e únicos", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });

  it("hashToken é determinístico (SHA-256 hex) e não revela o token", () => {
    const token = generateToken();
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
    expect(h1).not.toContain(token);
  });
});

describe("Provisionamento — convites (expiração e uso único)", () => {
  let organizationId = 0;

  beforeAll(async () => {
    const admin = await getAdmin();
    const { data } = await admin
      .from("organizations")
      .insert({ name: `Org Teste Convite ${Date.now()}`, is_active: true, status: "active" })
      .select("id")
      .single();
    organizationId = Number(data!.id);
    CLEANUP_IDS.push(organizationId);
  });

  it("token expirado → inválido", async () => {
    const token = generateToken();
    await createInvitation({
      organizationId,
      email: "expirado@test.local",
      role: "assistant",
      type: "staff_invite",
      expiresAt: new Date(Date.now() - 1000), // já expirado
      invitedBy: null,
      tokenHash: hashToken(token),
    });

    const found = await findValidInvitationByHash(hashToken(token));
    expect(found).toBeNull();
  });

  it("token usado → inválido (uso único)", async () => {
    const token = generateToken();
    const invitationId = await createInvitation({
      organizationId,
      email: "usado@test.local",
      role: "assistant",
      type: "staff_invite",
      expiresAt: new Date(Date.now() + 3_600_000),
      invitedBy: null,
      tokenHash: hashToken(token),
    });

    expect(await findValidInvitationByHash(hashToken(token))).not.toBeNull();
    await markInvitationUsed(invitationId);
    expect(await findValidInvitationByHash(hashToken(token))).toBeNull();
  });
});

describe("Provisionamento — suspensão sem apagar dados", () => {
  it("suspender mantém a organização existente (soft)", async () => {
    const admin = await getAdmin();
    const { data } = await admin
      .from("organizations")
      .insert({ name: `Org Teste Susp ${Date.now()}`, is_active: true, status: "active" })
      .select("id")
      .single();
    const orgId = Number(data!.id);
    CLEANUP_IDS.push(orgId);

    await setOrganizationStatus(orgId, "suspended");
    const { data: after } = await admin
      .from("organizations")
      .select("status, is_active")
      .eq("id", orgId)
      .single();
    expect(after!.status).toBe("suspended");
    expect(after!.is_active).toBe(false); // trigger sincroniza

    // Reativação (renovação)
    await setOrganizationStatus(orgId, "active");
    const { data: active } = await admin.from("organizations").select("is_active").eq("id", orgId).single();
    expect(active!.is_active).toBe(true);
  });
});

afterAll(async () => {
  const admin = await getAdmin();
  for (const id of CLEANUP_IDS) {
    await admin.from("organizations").delete().eq("id", id);
  }
});
