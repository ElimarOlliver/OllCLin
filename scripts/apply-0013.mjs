// Aplica a migration 0013 no Supabase (Postgres) de forma idempotente.
// Verifica cada coluna antes de adicionar — reexecutar não quebra.
import pg from "pg";
import { readFileSync } from "node:fs";
import "dotenv/config";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

const COLUNAS = [
  ["opcao_simples_nacional", `ALTER TABLE configuracoes_fiscais ADD COLUMN opcao_simples_nacional BOOLEAN NOT NULL DEFAULT FALSE`],
  ["codigo_tributacao_servico", `ALTER TABLE configuracoes_fiscais ADD COLUMN codigo_tributacao_servico VARCHAR(10) NULL`],
  ["descricao_servico_padrao", `ALTER TABLE configuracoes_fiscais ADD COLUMN descricao_servico_padrao VARCHAR(255) NULL`],
  ["iss_retido", `ALTER TABLE configuracoes_fiscais ADD COLUMN iss_retido BOOLEAN NOT NULL DEFAULT FALSE`],
  ["modo_certificado", `ALTER TABLE configuracoes_fiscais ADD COLUMN modo_certificado TEXT NOT NULL DEFAULT 'A1_SERVIDOR'`],
];

try {
  await client.connect();
  for (const [coluna, ddl] of COLUNAS) {
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='configuracoes_fiscais' AND column_name=$1`,
      [coluna],
    );
    if (rows.length > 0) {
      console.log(`skip: ${coluna} já existe`);
    } else {
      await client.query(ddl);
      console.log(`ok: ${coluna} adicionada`);
    }
  }
  // Confirmação final
  const final = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='configuracoes_fiscais' AND column_name LIKE ANY(ARRAY['modo_certificado','opcao_simples_nacional','iss_retido','descricao_servico_padrao','codigo_tributacao_servico'])`,
  );
  console.log("colunas finais:", final.rows.map((r) => r.column_name).join(", "));
} finally {
  await client.end();
}
