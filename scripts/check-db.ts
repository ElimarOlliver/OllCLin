import "dotenv/config";
import { createConnection } from "node:net";

const url = process.env.DATABASE_URL ?? "";
let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  console.error("DATABASE_URL inválida; prefixo:", url.slice(0, 15));
  process.exit(1);
}
const porta = Number(parsed.port) || (parsed.protocol === "postgresql:" ? 5432 : 3306);
const s = createConnection(porta, parsed.hostname);
s.setTimeout(10_000);
s.on("connect", () => {
  console.log(`TCP OK ${parsed.hostname}:${porta} (protocolo ${parsed.protocol})`);
  s.end();
  process.exit(0);
});
s.on("timeout", () => {
  console.log(`TCP TIMEOUT ${parsed.hostname}:${porta}`);
  process.exit(1);
});
s.on("error", (e: Error) => {
  console.log(`TCP ERRO ${parsed.hostname}:${porta}: ${e.message}`);
  process.exit(1);
});
