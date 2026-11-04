// Executa statements individuais (split por ";\n") de um arquivo de migração.
// Uso: node scripts/pg-split-run.mjs <arquivo.sql>
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/pg-split-run.mjs <arquivo.sql>");
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
// Remove comentários de linha para não quebrar o split
const noComments = raw
  .split(/\r?\n/)
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const statements = [];
let buffer = "";
let inDollar = false;
for (const chunk of noComments.split(/(?<=;)/)) {
  buffer += chunk;
  const dollarCount = (buffer.match(/\$\$/g) ?? []).length;
  inDollar = dollarCount % 2 === 1;
  if (buffer.trim().endsWith(";") && !inDollar) {
    statements.push(buffer.trim());
    buffer = "";
  }
}
if (buffer.trim()) statements.push(buffer.trim());

const list = statements.map((s) => s.trim()).filter((s) => s.length > 0);

console.log(`Total de statements: ${list.length}`);
let i = 0;
for (const stmt of list) {
  i++;
  const oneLine = stmt.replace(/\s+/g, " ").slice(0, 90);
  try {
    execFileSync(
      "node",
      ["scripts/db-select.mjs", stmt],
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 30000 },
    );
    console.log(`  [${i}/${list.length}] OK — ${oneLine}`);
  } catch (err) {
    const msg = err.stdout ? err.stdout.toString().slice(0, 200) : err.message;
    console.error(`  [${i}/${list.length}] FALHOU — ${oneLine}\n    ${msg}`);
    process.exit(1);
  }
}
console.log("\n✅ Migração aplicada statement a statement.");
