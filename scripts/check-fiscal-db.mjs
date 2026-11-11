// Verifica se as tabelas fiscais e a migration 0013 existem no Supabase.
// Script temporário de operação — pode ser removido depois.
import pg from "pg";
import "dotenv/config";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN ('configuracoes_fiscais','notas_fiscais','fila_fiscal','empresas_fiscais')`,
  );
  console.log("tabelas fiscais:", JSON.stringify(tables.rows));
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='configuracoes_fiscais'
       AND column_name IN ('modo_certificado','opcao_simples_nacional','iss_retido')`,
  );
  console.log("colunas 0013 ja aplicadas:", JSON.stringify(cols.rows));
} finally {
  await client.end();
}
