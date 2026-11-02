// OllCLin - Aplica migrações SQL no Supabase sem depender de DATABASE_URL no .env
//
// Uso: node scripts/apply-migration.mjs <arquivo.sql> "<SENHA_DO_BANCO>" [regiao]
// Região padrão: aws-1-sa-east-1 (confirmada como a região deste projeto).
//
// Reutiliza o cliente Postgres de scripts/pg-client.mjs via DATABASE_URL temporária.

import "dotenv/config";
import { spawnSync } from "node:child_process";

const file = process.argv[2];
const password = process.argv[3];
const region = process.argv[4] ?? "aws-1-sa-east-1";

if (!file || !password) {
  console.error("Uso: node scripts/apply-migration.mjs <arquivo.sql> <SENHA> [regiao]");
  process.exit(1);
}

const projectRef = (process.env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
if (!projectRef) {
  console.error("SUPABASE_URL ausente ou inválida no .env");
  process.exit(1);
}

const user = `postgres.${projectRef}`;
const databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${region}.pooler.supabase.com:6543/postgres`;

const result = spawnSync(
  process.execPath,
  ["scripts/pg-client.mjs", "--file", `drizzle/migrations/${file}`],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  },
);
process.exit(result.status ?? 1);
