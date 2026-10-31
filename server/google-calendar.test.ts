/**
 * OllCLin - Testes da integração Google Calendar (sem chamar o Google)
 *
 * Cobrem as partes sensíveis que não dependem de rede/banco:
 * - assinatura e validade do `state` OAuth (CSRF);
 * - montagem da URL de consentimento;
 * - cifragem/decifragem dos tokens (AES-256-GCM);
 * - normalização de datas sem fuso para o formato do Google.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GoogleCalendarError,
  buildAuthUrl,
  createOAuthState,
  toGoogleDateTime,
  verifyOAuthState,
} from "./lib/google-calendar";
import { decryptSecret, encryptSecret } from "./lib/token-crypto";

const originalEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  GOOGLE_OAUTH_STATE_SECRET: process.env.GOOGLE_OAUTH_STATE_SECRET,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  PUBLIC_URL: process.env.PUBLIC_URL,
};

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID =
    "123456789012-abcdefghijklmnop.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "test-encryption-key";
  process.env.GOOGLE_OAUTH_STATE_SECRET = "test-state-secret";
  process.env.PUBLIC_URL = "http://localhost:3000";
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("state do OAuth", () => {
  it("faz ida e volta preservando usuário e organização", () => {
    const state = createOAuthState({ userId: 7, organizationId: 3 });
    expect(verifyOAuthState(state)).toEqual({ userId: 7, organizationId: 3 });
  });

  it("rejeita assinatura adulterada", () => {
    const state = createOAuthState({ userId: 1, organizationId: 1 });
    expect(() => verifyOAuthState(`${state.slice(0, -4)}abcd`)).toThrow(
      GoogleCalendarError,
    );
  });

  it("rejeita state sem assinatura", () => {
    expect(() => verifyOAuthState("sem-assinatura")).toThrow(GoogleCalendarError);
  });

  it("monta a URL de consentimento com redirect e escopo corretos", () => {
    const state = createOAuthState({ userId: 1, organizationId: 1 });
    const url = new URL(buildAuthUrl(state));

    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/google-calendar/callback",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events",
    );
  });
});

describe("criptografia dos tokens", () => {
  it("cifra sem expor o texto puro e decifra corretamente", () => {
    const secret = "refresh-token-super-secreto";
    const envelope = encryptSecret(secret);

    expect(envelope.startsWith("v1:")).toBe(true);
    expect(envelope).not.toContain(secret);
    expect(decryptSecret(envelope)).toBe(secret);
  });

  it("rejeita envelope adulterado", () => {
    const envelope = encryptSecret("token");
    expect(() => decryptSecret(envelope.replace(/.$/, "A"))).toThrow();
  });

  it("rejeita envelope em formato inválido", () => {
    expect(() => decryptSecret("texto-puro")).toThrow();
  });
});

describe("datas do Google", () => {
  it("mantém a hora local quando o banco devolve timestamp sem fuso", () => {
    expect(toGoogleDateTime("2026-10-30T09:30:00")).toBe("2026-10-30T09:30:00");
    expect(toGoogleDateTime("2026-10-30T09:30")).toBe("2026-10-30T09:30:00");
  });

  it("converte ISO com fuso para a hora local do servidor", () => {
    const value = "2026-10-30T13:05:00.000Z";
    const date = new Date(value);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected =
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

    expect(toGoogleDateTime(value)).toBe(expected);
  });

  it("rejeita data inválida", () => {
    expect(() => toGoogleDateTime("não é data")).toThrow(GoogleCalendarError);
  });
});
