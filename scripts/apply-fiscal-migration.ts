/**
 * Aplica a migration 0012 do módulo fiscal (FISCAL.md §6) no MySQL apontado
 * por DATABASE_URL. Idempotente: usa CREATE TABLE IF NOT EXISTS e checa
 * colunas antes de ALTER.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = "drizzle/migrations/0012_modulo_fiscal.sql";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const conn = await mysql.createConnection(url);

  const sql = readFileSync(MIGRATION, "utf8");
  // Divide em statements; os ALTERs de appointments/professionals precisam de
  // checagem de existência de coluna para ser idempotente.
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  let aplicados = 0;
  for (const stmt of statements) {
    const upper = stmt.toUpperCase();
    // ALTERs: checa se a coluna já existe antes
    if (upper.startsWith("ALTER TABLE")) {
      const match = /ALTER TABLE (\w+)/.exec(stmt);
      const tabela = match?.[1];
      const colunaMatch = /ADD COLUMN (\w+)/.exec(stmt);
      if (tabela && colunaMatch) {
        const [cols] = (await conn.query(`SHOW COLUMNS FROM ${tabela}`)) as unknown as [
          Array<{ Field: string }>,
          unknown,
        ];
        if (cols?.some((c) => c.Field === colunaMatch[1])) {
          continue; // já aplicado
        }
      }
    }
    try {
      await conn.query(stmt);
      aplicados++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists") || msg.includes("Duplicate key")) continue;
      console.error(`Falha no statement:\n${stmt.slice(0, 120)}...\n→ ${msg}`);
      throw err;
    }
  }

  const [tables] = (await conn.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('empresas_fiscais','tomadores_fiscais','certificados','cofre_fiscal',
                          'configuracoes_fiscais','numeracao_fiscal','notas_fiscais','eventos_fiscais',
                          'logs_fiscais','fila_fiscal')`,
  )) as unknown as [Array<{ table_name: string | TABLE_NAME }>];

  type TABLE_NAME = { TABLE_NAME: string };
  const nomes = tables.map((t) => t.table_name ?? (t as unknown as TABLE_NAME).TABLE_NAME);
  console.log(`Statements aplicados: ${aplicados}. Tabelas fiscais encontradas: ${nomes.length}/10`);
  console.log(nomes.sort().join(", "));
  await conn.end();
  if (nomes.length !== 10) throw new Error("Migration incompleta");
}

main().catch((e) => {
  console.error("Migration falhou:", e instanceof Error ? e.message : e);
  process.exit(1);
});
