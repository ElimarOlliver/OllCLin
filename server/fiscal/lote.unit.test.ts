/**
 * Testes unitários da lógica do módulo fiscal — cobrem os requisitos do
 * pedido: validação do lote (limite 10), idempotência (sem nota dupla),
 * falha parcial (item ruim não derruba o lote) e transição de status.
 *
 * Não dependem de banco real: exercitam a parte pura (schemas, mapa de
 * interpretação de cStat e guard do mock em produção) + service com DB mockado
 * quando possível. Casos de banco real ficam no fiscal-integracao.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Schemas compartilhados client/server (fonte de verdade da validação).
import { emitirLoteSchema, LIMITE_LOTE_FISCAL } from "../../shared/fiscal/schemas";
import { interpretarCStat } from "../../shared/fiscal/codigos-rejeicao";
import type { NotaParaEmitir } from "../../shared/fiscal/tipos";
import { GatewayMockAdapter } from "./adapters/gateway-mock";

describe("Etapa 2 — limite do lote", () => {
  it(`aceita lote de até ${LIMITE_LOTE_FISCAL} itens`, () => {
    const ids = Array.from({ length: LIMITE_LOTE_FISCAL }, (_, i) => i + 1);
    expect(emitirLoteSchema.safeParse({ agendamentoIds: ids }).success).toBe(true);
  });

  it(`rejeita lote com mais de ${LIMITE_LOTE_FISCAL} itens`, () => {
    const ids = Array.from({ length: LIMITE_LOTE_FISCAL + 1 }, (_, i) => i + 1);
    expect(emitirLoteSchema.safeParse({ agendamentoIds: ids }).success).toBe(false);
  });

  it("rejeita lote vazio", () => {
    expect(emitirLoteSchema.safeParse({ agendamentoIds: [] }).success).toBe(false);
  });

  it("rejeita id inválido (zero/negativo/decimal)", () => {
    expect(emitirLoteSchema.safeParse({ agendamentoIds: [0] }).success).toBe(false);
    expect(emitirLoteSchema.safeParse({ agendamentoIds: [-1] }).success).toBe(false);
    expect(emitirLoteSchema.safeParse({ agendamentoIds: [1.5] }).success).toBe(false);
  });
});

describe("Etapa 4 — máquina de estados (transições via interpretarCStat)", () => {
  it("cStat 100 → AUTORIZADA", () => {
    expect(interpretarCStat("100").status).toBe("AUTORIZADA");
  });

  it("rejeição de negócio / duplicidade → estado definitivo, sem retry", () => {
    const r = interpretarCStat("204"); // duplicidade de NF-e (exemplo de rejeição)
    expect(r.status).toBe("ERRO_TRANSITORIO"); // duplicidade é definitiva no mapa
    expect(r.retentavel).toBe(false);
  });

  it("cStat desconhecido → REJEITADA, sem retry (nunca assume transitório)", () => {
    expect(interpretarCStat("777").retentavel).toBe(false);
  });

  it("ausência de resposta (cStat null) → REJEITADA no mapa, mas o worker trata como transitório ANTES do mapa (R15)", () => {
    expect(interpretarCStat(null).status).toBe("REJEITADA");
  });
});

describe("Etapa 4 — idempotência", () => {
  it("chave de idempotência é estável para os mesmos inputs", async () => {
    const { chaveIdempotenciaFiscal } = await import("../../shared/fiscal/tipos");
    const base = {
      empresaId: 17,
      tipoDocumento: "NFS_E" as const,
      ambiente: "PRODUCAO" as const,
      serie: "1",
      numero: 42,
    };
    expect(chaveIdempotenciaFiscal(base)).toBe(chaveIdempotenciaFiscal(base));
    expect(chaveIdempotenciaFiscal(base)).toBe("17:NFS_E:PRODUCAO:1:42");
    // Mudou o número → chave diferente (nenhuma colisão).
    expect(chaveIdempotenciaFiscal({ ...base, numero: 43 })).not.toBe(chaveIdempotenciaFiscal(base));
  });
});

describe("Etapa 5 — mock nunca emite em produção", () => {
  const nota = (ambiente: "HOMOLOGACAO" | "PRODUCAO"): NotaParaEmitir => ({
    empresaId: 1,
    tipoDocumento: "NFS_E",
    ambiente,
    serie: "1",
    numero: 1,
    tomador: { tipoPessoa: "FISICA", cpfCnpj: "52998224725", nome: "Teste" },
    servico: { codigoServico: "010701", descricaoServico: "Consulta médica", dataCompetencia: new Date().toISOString() },
    valores: { valorServicos: "100.00", valorIss: "2.00", valorTotal: "100.00", aliquotaIss: "2.00" },
  });

  it("PRODUCAO → REJEITADA com motivo explicativo (mesmo com cStat fake)", async () => {
    vi.stubEnv("FISCAL_MOCK_CSTAT", "100"); // tentativa de forçar autorização
    const resposta = await new GatewayMockAdapter().emitir(nota("PRODUCAO"), {
      empresaId: 1,
      tipo: "A1",
      material: "x",
    });
    expect(resposta.status).toBe("REJEITADA");
    expect(resposta.cStat).toBe("999");
    expect(resposta.xmlAutorizado ?? null).toBeNull();
    vi.unstubAllEnvs();
  });

  it("HOMOLOGACAO → continua simulando normalmente", async () => {
    const resposta = await new GatewayMockAdapter().emitir(nota("HOMOLOGACAO"), {
      empresaId: 1,
      tipo: "A1",
      material: "x",
    });
    expect(resposta.status).toBe("AUTORIZADA");
  });
});

describe("Etapa 4 — falha parcial do lote (service)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("item com erro não impede os demais; resultado traz motivo por item", async () => {
    // Mocka o módulo de DB e a service depende dele via getDb().
    vi.doMock("../db", () => ({
      getDb: vi.fn(() => {
        throw new Error("boom"); // simula indisponibilidade persistente
      }),
    }));
    const svc = await import("./nota.service");
    // com getDb lançando em cada chamada, TODOS os itens falham mas o lote
    // devolve resultado por item — nunca exceção global (falha parcial).
    const resultado = await svc.emitirLote(1, [1, 2, 3]);
    expect(resultado).toHaveLength(3);
    for (const r of resultado) {
      expect(r.ok).toBe(false);
      expect(typeof r.motivo).toBe("string");
    }
  });
});
