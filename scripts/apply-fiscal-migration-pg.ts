/**
 * Aplica a migration 0012 (PostgreSQL/Supabase) do módulo fiscal.
 * Idempotente: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS.
 * Uso: npx tsx scripts/apply-fiscal-migration-pg.ts
 */
import "dotenv/config";
import pg from "pg";
import { readFileSync } from "node:fs";

const MIGRATION = "drizzle/migrations/0012_modulo_fiscal_pg.sql";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const client = new pg.Client({ connectionString: url });
  await client.connect();

  const sql = readFileSync(MIGRATION, "utf8");
  // Executa como um script único — Postgres suporta múltiplos comandos por query,
  // exceto o bloco DO $$ que também é seguro em query única.
  await client.query(sql);

  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('empresas_fiscais','tomadores_fiscais','certificados','cofre_fiscal',
                          'configuracoes_fiscais','numeracao_fiscal','notas_fiscais','eventos_fiscais',
                          'logs_fiscais','fila_fiscal')`,
  );
  const total = Number(rows[0].count);
  console.log(`Tabelas fiscais criadas: ${total}/10`);

  const rls = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN ('empresas_fiscais','tomadores_fiscais','certificados','cofre_fiscal',
                         'configuracoes_fiscais','numeracao_fiscal','notas_fiscais','eventos_fiscais',
                         'logs_fiscais','fila_fiscal')
       AND rowsecurity = true`,
  );
  console.log(`Tabelas com RLS ativo: ${rls.rows.length}/10`);

  await client.end();
  if (total !== 10 || rls.rows.length !== 10) {
    throw new Error("Migration incompleta");
  }
  console.log("Migration 0012 aplicada com sucesso.");
}

main().catch((e) => {
  console.error("Migration falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
