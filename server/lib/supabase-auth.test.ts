/**
 * OllCLin - Testes da resolução de usuário via Supabase Auth
 *
 * Cobrem o mapeamento access token -> usuário local (users -> organization_id)
 * sem depender de rede real: o cliente do Supabase Auth e o admin do backend são
 * substituídos por stubs.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();

beforeAll(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "sb_secret_test";
});

vi.mock("./supabase-server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        ilike: () => ({
          limit: () => ({
            maybeSingle,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "supabase-uuid-1", email: "admin@ollclin.local" } },
        error: null,
      })),
    },
  }),
}));

import { findLocalUserByEmail, resolveUserFromSupabaseAccessToken } from "./supabase-auth";

describe("supabase auth user resolution", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("resolve o usuário local a partir do e-mail do token válido", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 1,
        open_id: "dev-local",
        name: "Administrador (dev)",
        email: "admin@ollclin.local",
        login_method: "supabase",
        role: "admin",
        organization_id: 1,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
        last_signed_in: "2026-10-01T00:00:00Z",
      },
      error: null,
    });

    const user = await resolveUserFromSupabaseAccessToken("fake-token");

    expect(user).not.toBeNull();
    expect(user?.id).toBe(1);
    expect(user?.organizationId).toBe(1);
    expect(user?.role).toBe("admin");
  });

  it("retorna null quando não há vínculo local para o e-mail", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const user = await resolveUserFromSupabaseAccessToken("fake-token");
    expect(user).toBeNull();
  });

  it("retorna null para e-mail vazio", async () => {
    const user = await findLocalUserByEmail(null);
    expect(user).toBeNull();
  });
});
