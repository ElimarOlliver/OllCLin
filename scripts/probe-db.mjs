// OllCLin - Diagnóstico de conexão ao Postgres (pooler Supabase)
//
// Uso: node.cmd scripts/probe-db.mjs [porta] [regiao]
// Testa a conexão com protocolo Postgres 3.0 e reporta a resposta do servidor.

import "dotenv/config";
import net from "node:net";

const portArg = Number(process.argv[2] ?? 6543);
const url = new URL(process.env.DATABASE_URL ?? "");
const regionArg = process.argv[3];

function buildStartup(user, database) {
  const params = [
    ["user", user],
    ["database", database],
    ["client_encoding", "UTF8"],
  ];
  let payload = Buffer.alloc(0);
  for (const [k, v] of params) {
    payload = Buffer.concat([payload, Buffer.from(k + "\0"), Buffer.from(v + "\0"), Buffer.from("\0")]);
  }
  const len = 8 + payload.length;
  const msg = Buffer.alloc(len);
  msg.writeInt32BE(len, 0);
  msg.writeInt16BE(3, 4); // protocol 3.0
  msg.writeInt16BE(0, 6);
  payload.copy(msg, 8);
  return msg;
}

function probe(host, port, label) {
  return new Promise((resolve) => {
    const url2 = new URL(process.env.DATABASE_URL);
    const user = decodeURIComponent(url2.username);
    const database = url2.pathname.replace(/^\//, "") || "postgres";

    const socket = net.createConnection({ host, port });
    socket.setTimeout(12000);
    let buf = Buffer.alloc(0);
    const result = { label, connected: false, authCode: null, error: null };

    socket.on("connect", () => {
      result.connected = true;
      socket.write(buildStartup(user, database));
    });

    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 5) {
        const type = buf.toString("ascii", 0, 1);
        const len = buf.readInt32BE(1);
        if (buf.length < len + 1) break;
        const body = buf.subarray(5, 1 + len);
        buf = buf.subarray(1 + len);

        if (type === "R") {
          const code = body.readInt32BE(0);
          result.authCode = code;
          console.log(`[${label}] autenticação código=${code} (${authName(code)})`);
          if (code === 0) {
            console.log(`[${label}] ✅ Autenticado com sucesso!`);
            socket.destroy();
            resolve(result);
            return;
          }
          // Não temos o fluxo completo SCRAM aqui; apenas reportamos.
          socket.destroy();
          resolve(result);
          return;
        }
        if (type === "E") {
          // Parse dos campos do ErrorResponse: S/V/C/M/D/F/L
          const text = body.toString("utf8");
          const mMatch = text.match(/\x00M([^\x00]*)/);
          result.error = mMatch ? mMatch[1] : text;
          console.log(`[${label}] ❌ Erro do servidor: ${result.error}`);
          socket.destroy();
          resolve(result);
          return;
        }
        if (type === "Z") {
          console.log(`[${label}] ✅ Pronto para queries.`);
          socket.destroy();
          resolve(result);
          return;
        }
      }
    });

    socket.on("timeout", () => { result.error = "timeout"; console.log(`[${label}] ⏱ Timeout`); socket.destroy(); resolve(result); });
    socket.on("error", (e) => { result.error = e.message; console.log(`[${label}] ❌ Erro de rede: ${e.message}`); resolve(result); });
  });
}

function authName(code) {
  const map = { 0: "ok", 3: "cleartext", 5: "md5", 10: "SASL(SCRAM)", 12: "SASL final" };
  return map[code] ?? "desconhecido";
}

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const baseHost = url.hostname; // aws-0-REGIAO.pooler.supabase.com

  console.log("Diagnóstico de conexão Supabase Postgres\n");
  console.log(`DATABASE_URL host: ${baseHost}`);

  // Portas possíveis do pooler: 6543 (transação) e 5432 (sessão)
  for (const port of portArg ? [portArg] : [6543, 5432]) {
    await probe(baseHost, port, `${baseHost}:${port}`);
    console.log("");
  }

  // Direto (sem pooler): db.PROJETO.supabase.co:5432
  const projectId = (process.env.SUPABASE_URL ?? "").replace(/^https?:\/\//, "").split(".")[0];
  if (projectId) {
    await probe(`db.${projectId}.supabase.co`, 5432, `db.${projectId}.supabase.co:5432 (direto)`);
    console.log("");
  }

  console.log("Legenda de códigos de autenticação: 0=ok 3=cleartext 5=md5 10=SASL(SCRAM)");
}

main();
