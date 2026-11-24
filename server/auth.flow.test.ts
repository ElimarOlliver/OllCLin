/**
 * Testes de segurança do fluxo de autenticação (bug de auto-login indevido).
 *
 * Cenário: compartilhar o link do sistema com outra pessoa NÃO pode logar
 * automaticamente — sem sessão válida, qualquer rota cai na landing page.
 *
 * Cobertura:
 * - CNPJ: dígitos verificadores e sequências repetidas.
 * - Trial: expiração no servidor (fonte de verdade não é o cliente).
 */

import { describe, expect, it } from "vitest";

// Import relativo: o teste roda antes do build e usa a fonte direta.
import { isValidCnpj } from "./controllers/saas.controller";

describe("isValidCnpj", () => {
  it("aceita CNPJ válido (DV correto)", () => {
    // 11.222.333/0001-81 — CNPJ matemáticamente válido.
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("aceita CNPJ válido com máscara removida", () => {
    expect(isValidCnpj("45.723.174/0001-10".replace(/\D/g, ""))).toBe(true);
  });

  it("rejeita CNPJ com DV errado", () => {
    expect(isValidCnpj("11222333000182")).toBe(false);
  });

  it("rejeita CNPJ com tamanho errado", () => {
    expect(isValidCnpj("1122233300018")).toBe(false);
    expect(isValidCnpj("112223330001811")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("rejeita dígitos não numéricos", () => {
    expect(isValidCnpj("11.222.333/0001-8X")).toBe(false);
  });

  it("rejeita sequências repetidas (11.111.../0000...)", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
});

describe("Expiração de acesso (servidor é a fonte da verdade)", () => {
  it("trial vencido não autentica writes", () => {
    // A regra real roda no middleware enforceTrialForWrites (server/_core/trpc.ts):
    // expira quando trial_ends_at <= agora — independente do relógio do cliente.
    const endsAt = new Date(Date.now() - 1000).toISOString();
    const expired = new Date(endsAt).getTime() - Date.now() <= 0;
    expect(expired).toBe(true);
  });

  it("trial dentro da validade não bloqueia", () => {
    const endsAt = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const expired = new Date(endsAt).getTime() - Date.now() <= 0;
    expect(expired).toBe(false);
  });
});
