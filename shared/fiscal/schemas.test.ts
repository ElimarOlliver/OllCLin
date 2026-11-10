/**
 * Testes do módulo fiscal (FISCAL.md §18) — lógica pura, sem banco.
 * Cobertura: dígito verificador CPF/CNPJ (R22), mapa de rejeição (R23),
 * mascaramento LGPD, schemas Zod, cofre (R05/R06).
 */

import { describe, expect, it } from "vitest";
import { cpfValido, cnpjValido, emitirLoteSchema, cancelarNotaSchema, documentoTomadorSchema } from "./schemas";
import { interpretarCStat } from "./codigos-rejeicao";
import { chaveIdempotenciaFiscal } from "./tipos";
import { mascararDocumento } from "@serverlib/fiscal/nota.service";
import { encryptSecret, decryptSecret } from "@serverlib/lib/token-crypto";

describe("dígito verificador (R22)", () => {
  it("aceita CPF válido", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
  });
  it("rejeita CPF com DV errado", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
  });
  it("rejeita CPF com dígitos repetidos", () => {
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
  it("aceita CNPJ válido", () => {
    expect(cnpjValido("11.444.777/0001-61")).toBe(true);
  });
  it("rejeita CNPJ com DV errado", () => {
    expect(cnpjValido("11.444.777/0001-62")).toBe(false);
  });
  it("schema de tomador discrimina por tipoPessoa", () => {
    expect(documentoTomadorSchema.safeParse({ tipoPessoa: "FISICA", cpf: "52998224725" }).success).toBe(true);
    expect(documentoTomadorSchema.safeParse({ tipoPessoa: "JURIDICA", cnpj: "11444777000161" }).success).toBe(true);
    expect(documentoTomadorSchema.safeParse({ tipoPessoa: "FISICA", cpf: "11111111111" }).success).toBe(false);
  });
});

describe("mapa de rejeição (R23/R24 — §18)", () => {
  it("cStat 100 → AUTORIZADA", () => {
    expect(interpretarCStat("100").status).toBe("AUTORIZADA");
  });
  it("cStat 539 → consulta sem reenvio (não retentável)", () => {
    const r = interpretarCStat("539");
    expect(r.retentavel).toBe(false);
  });
  it("cStat 110/301/302 → DENEGADA sem retry", () => {
    for (const c of ["110", "301", "302"]) {
      expect(interpretarCStat(c).status).toBe("DENEGADA");
      expect(interpretarCStat(c).retentavel).toBe(false);
    }
  });
  it("cStat 999 → ERRO_TRANSITORIO com retry", () => {
    const r = interpretarCStat("999");
    expect(r.status).toBe("ERRO_TRANSITORIO");
    expect(r.retentavel).toBe(true);
  });
  it("cStat desconhecido → REJEITADA sem retry (nunca assume transitório)", () => {
    const r = interpretarCStat("1234");
    expect(r.status).toBe("REJEITADA");
    expect(r.retentavel).toBe(false);
  });
  it("sem cStat → REJEITADA conservadora", () => {
    expect(interpretarCStat(null).status).toBe("REJEITADA");
  });
});

describe("chave de idempotência (§7)", () => {
  it("combina empresa + tipo + ambiente + serie + numero", () => {
    expect(
      chaveIdempotenciaFiscal({
        empresaId: 1,
        tipoDocumento: "NFS_E",
        ambiente: "PRODUCAO",
        serie: "1",
        numero: 42,
      }),
    ).toBe("1:NFS_E:PRODUCAO:1:42");
  });
});

describe("LGPD — mascaramento de documento nos logs", () => {
  it("mascara CPF", () => {
    const m = mascararDocumento("52998224725");
    expect(m).not.toContain("529982");
    expect(m.startsWith("***")).toBe(true);
  });
  it("mascara CNPJ", () => {
    const m = mascararDocumento("11444777000161");
    expect(m).not.toContain("444777");
  });
});

describe("schemas de emissão", () => {
  it("lote aceita até 50 e rejeita 51", () => {
    const ids50 = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(emitirLoteSchema.safeParse({ agendamentoIds: ids50 }).success).toBe(true);
    const ids51 = Array.from({ length: 51 }, (_, i) => i + 1);
    expect(emitirLoteSchema.safeParse({ agendamentoIds: ids51 }).success).toBe(false);
  });
  it("cancelamento exige motivo ≥ 15 caracteres (V5)", () => {
    expect(cancelarNotaSchema.safeParse({ notaId: 1, motivo: "curto demais" }).success).toBe(false);
    expect(cancelarNotaSchema.safeParse({ notaId: 1, motivo: "Erro nos valores da nota fiscal" }).success).toBe(true);
  });
});

describe("cofre (R05/R06) — envelope roundtrip", () => {
  it("cifra e decifra sem expor material em claro", () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = "teste-unitario-cofre";
    const segredo = "MIICxxxxxxPFX-CONTENT";
    const envelope = encryptSecret(segredo);
    expect(envelope).not.toContain(segredo);
    expect(decryptSecret(envelope)).toBe(segredo);
  });
});
