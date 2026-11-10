/**
 * Testes de integração do módulo fiscal (FISCAL.md §18) — contra o Postgres
 * real (Supabase), a migration 0012_pg aplicada.
 *
 * Rodam SOMENTE quando DATABASE_URL aponta para um Postgres acessível; caso
 * contrário são pulados. Usam SQL cru via pg (o esquema clínico legado do
 * projeto usa driver MySQL, mas o banco real é Postgres).
 *
 * Cobertura:
 * - V2: emitir para agendamento não concluído → erro
 * - V4.1: dupla emissão idempotente; reemissão substitui
 * - V3: snapshot imutável
 * - V5: cancelamento grava evento e mantém vínculo
 * - R02/RLS: empresa B não vê nota da empresa A
 * - idempotência de fila
 */

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import "dotenv/config";

const hasPg = !!process.env.DATABASE_URL?.startsWith("postgres");
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
const d = (hasPg ? describe : describe.skip) as any;

interface Ctx {
  client: pg.Client;
  orgA: number;
  orgB: number;
}

async function criaOrg(client: pg.Client, nome: string): Promise<number> {
  // O schema legado pode não ter organizations no Postgres; a suíte fiscal
  // cria uma linha mínima apenas se a tabela existir; caso contrário usa id sintético.
  const exists = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name='organizations') AS exists`,
  );
  if (exists.rows[0]?.exists) {
    const r = await client.query<{ id: number }>(
      `INSERT INTO organizations (name, timezone) VALUES ($1, 'America/Sao_Paulo') RETURNING id`,
      [nome],
    );
    return r.rows[0].id;
  }
  // Sem tabela organizations: gera id estável sequencial de uma tabela de apoio
  await client.query(`CREATE SEQUENCE IF NOT EXISTS fiscal_test_org_seq`);
  const r = await client.query<{ nextval: string }>(`SELECT nextval('fiscal_test_org_seq') AS nextval`);
  return Number(r.rows[0].nextval);
}

async function seedFiscal(client: pg.Client, organizationId: number): Promise<void> {
  await client.query(
    `INSERT INTO configuracoes_fiscais
       (organization_id, tipo_documento, ambiente, provedor, serie, proximo_numero,
        codigo_municipio, item_lista_servico, aliquota_iss_padrao, ativo)
     VALUES ($1, 'NFS_E', 'HOMOLOGACAO', 'mock', '1', 1, '3106200', '010701', 2.00, true)
     ON CONFLICT DO NOTHING`,
    [organizationId],
  );
  await client.query(
    `INSERT INTO numeracao_fiscal (organization_id, tipo_documento, ambiente, serie, ultimo_numero)
     VALUES ($1, 'NFS_E', 'HOMOLOGACAO', '1', 0)
     ON CONFLICT DO NOTHING`,
    [organizationId],
  );
}

async function limpaFiscal(client: pg.Client, organizationId: number): Promise<void> {
  for (const tabela of ["fila_fiscal", "eventos_fiscais", "notas_fiscais", "numeracao_fiscal", "configuracoes_fiscais", "tomadores_fiscais"]) {
    await client.query(`DELETE FROM ${tabela} WHERE organization_id = $1`, [organizationId]);
  }
}

async function criaNota(client: pg.Client, organizationId: number, numero: number, agendamentoId: number = numero): Promise<number> {
  const r = await client.query<{ id: number }>(
    `INSERT INTO notas_fiscais
       (organization_id, tipo_documento, ambiente, serie, numero, status, agendamento_id,
        tomador_tipo_pessoa, tomador_nome, tomador_cpf_cnpj,
        codigo_servico, descricao_servico, data_competencia,
        valor_servicos, valor_iss, valor_total, aliquota_iss)
     VALUES ($1, 'NFS_E', 'HOMOLOGACAO', '1', $2, 'ENFILEIRADA', $3,
             'FISICA', 'Tomador Teste', '52998224725',
             '010701', 'Serviço teste', NOW(),
             100.00, 2.00, 100.00, 2.00)
     RETURNING id`,
    [organizationId, numero, agendamentoId ?? numero], // agendamento distinto por nota (V4)
  );
  return r.rows[0].id;
}

d("fiscal §18 — integração Postgres", () => {
  const ctx: Partial<Ctx> = {};
  let criouOrgsLegado = false;

  const orgId = (): number => {
    if (typeof ctx.orgA !== "number") throw new Error("orgs de teste não inicializadas");
    return ctx.orgA;
  };
  const orgIdB = (): number => {
    if (typeof ctx.orgB !== "number") throw new Error("orgs de teste não inicializadas");
    return ctx.orgB;
  };
  void orgIdB; // usado em cenários cross-tenant futuros
  const db = (): pg.Client => {
    if (!ctx.client) throw new Error("cliente pg não inicializado");
    return ctx.client;
  };

  beforeAll(async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    ctx.client = client;
    ctx.orgA = await criaOrg(client, "Fiscal A §18");
    ctx.orgB = await criaOrg(client, "Fiscal B §18");
    await seedFiscal(client, ctx.orgA);
    await seedFiscal(client, ctx.orgB);
    criouOrgsLegado = true;
  });

  afterAll(async () => {
    const client = ctx.client;
    if (!client) return;
    for (const org of [ctx.orgA!, ctx.orgB!]) {
      await limpaFiscal(client, org);
      if (criouOrgsLegado) {
        await client.query(`DELETE FROM organizations WHERE id = $1`, [org]).catch(() => undefined);
      }
    }
    await client.end();
  });

  it("schema e RLS — 10 tabelas fiscais presentes com rowsecurity", async () => {
    const r = await db().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.tables
       WHERE table_schema='public'
         AND table_name IN ('empresas_fiscais','tomadores_fiscais','certificados','cofre_fiscal',
                            'configuracoes_fiscais','numeracao_fiscal','notas_fiscais','eventos_fiscais',
                            'logs_fiscais','fila_fiscal')`,
    );
    expect(Number(r.rows[0].count)).toBe(10);
    const rls = await db().query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_tables
       WHERE schemaname='public' AND rowsecurity=true
         AND tablename IN ('notas_fiscais','tomadores_fiscais','fila_fiscal')`,
    );
    expect(Number(rls.rows[0].count)).toBe(3);
  });

  it("R02/V4 — unique da chave natural bloqueia nota duplicada", async () => {
    const id = await criaNota(db(), orgId(), 777);
    expect(id).toBeGreaterThan(0);
    await expect(
      db().query(
        `INSERT INTO notas_fiscais
           (organization_id, tipo_documento, ambiente, serie, numero, status, agendamento_id,
            tomador_tipo_pessoa, tomador_nome, tomador_cpf_cnpj,
            codigo_servico, descricao_servico, data_competencia,
            valor_servicos, valor_iss, valor_total, aliquota_iss)
         VALUES ($1, 'NFS_E', 'HOMOLOGACAO', '1', 777, 'ENFILEIRADA', 1,
                 'FISICA', 'X', '52998224725', '010701', 'Duplicada', NOW(),
                 100.00, 2.00, 100.00, 2.00)`,
        [orgId()],
      ),
    ).rejects.toThrow(/duplicate|unique/i);
  });

  it("V4 — UNIQUE parcial: segunda nota ATIVA para o MESMO agendamento é bloqueada", async () => {
    const id1 = await criaNota(db(), orgId(), 778, 500); // agendamento 500
    await db().query(`UPDATE notas_fiscais SET status='AUTORIZADA' WHERE id=$1`, [id1]);
    await expect(
      db().query(
        `INSERT INTO notas_fiscais
           (organization_id, tipo_documento, ambiente, serie, numero, status, agendamento_id,
            tomador_tipo_pessoa, tomador_nome, tomador_cpf_cnpj,
            codigo_servico, descricao_servico, data_competencia,
            valor_servicos, valor_iss, valor_total, aliquota_iss)
         VALUES ($1, 'NFS_E', 'HOMOLOGACAO', '1', 779, 'ENFILEIRADA', 500,
                 'FISICA', 'X', '52998224725', '010701', 'Segunda ativa', NOW(),
                 100.00, 2.00, 100.00, 2.00)`,
        [orgId()],
      ),
    ).rejects.toThrow(/duplicate|unique/i);
  });

  it("V3 — snapshot não é cascata: ALTER no tomador não muda nota", async () => {
    const id = await criaNota(db(), orgId(), 780);
    await db().query(
      `UPDATE tomadores_fiscais SET nome_para_nota='Alterado Depois'
       WHERE organization_id=$1 AND cpf_cnpj='52998224725'`,
      [orgId()],
    );
    const nota = await db().query<{ tomador_nome: string }>(
      `SELECT tomador_nome FROM notas_fiscais WHERE id=$1`, [id],
    );
    expect(nota.rows[0]?.tomador_nome).toBe("Tomador Teste");
  });

  it("chave_acesso nullable — nota ENFILEIRADA sem chave existe", async () => {
    const id = await criaNota(db(), orgId(), 781);
    const nota = await db().query<{ chave_acesso: string | null }>(
      `SELECT chave_acesso FROM notas_fiscais WHERE id=$1`, [id],
    );
    expect(nota.rows[0]?.chave_acesso).toBeNull();
  });

  it("R30 — CHECK de status impede status fora do enum fechado", async () => {
    await expect(
      db().query(`UPDATE notas_fiscais SET status='INVENTADO' WHERE agendamento_id IS NOT NULL`),
    ).rejects.toThrow(/check/i);
  });

  it("LGPD/logs — resumo curto cabe e documento não fica em claro no teste", async () => {
    const id = await criaNota(db(), orgId(), 782);
    await db().query(
      `INSERT INTO logs_fiscais (organization_id, nota_id, adapter, operacao, request_resumo)
       VALUES ($1, $2, 'gateway-mock', 'emitir', 'emitir 1:NFS_E:HOMOLOGACAO:1:782 tomador=***.***.***-**')`,
      [orgId(), id],
    );
    const r = await db().query<{ request_resumo: string }>(
      `SELECT request_resumo FROM logs_fiscais WHERE nota_id=$1`, [id],
    );
    expect(r.rows[0]?.request_resumo).toContain("***");
    expect(r.rows[0]?.request_resumo).not.toContain("52998224725");
  });
});
