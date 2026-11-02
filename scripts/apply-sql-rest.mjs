// OllCLin — Aplica migrações SQL no Supabase via REST pg-meta (POST /pg/query)
//
// Uso: node scripts/apply-sql-rest.mjs <arquivo.sql>
// Requer SUPABASE_URL e SUPABASE_SECRET_KEY no .env (já presentes).
import "dotenv/config";
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/apply-sql-rest.mjs <arquivo.sql>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SECRET_KEY ausentes no .env");
  process.exit(1);
}

const sql = fs.readFileSync(`drizzle/migrations/${file}`, "utf8");

const res = await fetch(`${url}/pg/query`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Falhou (${res.status}): ${text}`);
  process.exit(1);
}
console.log(`OK: ${file} aplicado.`);
if (text.trim()) console.log(text.slice(0, 2000));
