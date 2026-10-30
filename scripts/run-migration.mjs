// OllCLin - Aplicador de migrações SQL no Supabase via conexão Postgres direta
//
// Uso: node.cmd scripts/run-migration.mjs [arquivo.sql]
// Default: 0001_convenios_financeiro.sql
//
// Usa DATABASE_URL (pooler Supabase, porta 6543). Sem dependências externas:
// implementa o protocolo Postgres simples (startup + simple query).

import "dotenv/config";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function parseConn(urlStr) {
  const u = new URL(urlStr);
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "postgres",
  };
}

function md5Auth(user, password, salt) {
  const inner = crypto.createHash("md5").update(password + user).digest("hex");
  return "md5" + crypto.createHash("md5").update(inner + salt.toString("hex")).digest("hex");
}

/** Postgres startup message (protocol 3.0) + simple query, ver. mínimo. */
function runSql(conn, sql) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: conn.host, port: conn.port }, () => {});
    socket.setTimeout(20000);

    const params = [
      ["user", conn.user],
      ["database", conn.database],
      ["client_encoding", "UTF8"],
    ];
    const payload = Buffer.from(params.flatMap(([k, v]) => [Buffer.from(k + "\0"), Buffer.from(v + "\0"), Buffer.from("\0")]));
    const len = 4 + 2 + payload.length;
    const start = Buffer.alloc(len);
    start.writeInt32BE(len, 0);
    start.writeInt16BE(3, 4);
    payload.copy(start, 6);
    socket.write(start);

    let state = "startup";
    let buffer = Buffer.alloc(0);
    const out = [];

    function handleMessage(type, body) {
      if (state === "auth") {
        if (type === "R") {
          const code = body.readInt32BE(0);
          if (code === 0) { state = "params"; return; }
          if (code === 3) {
            const pwd = Buffer.from("password\0"); // cleartext
            const msg = Buffer.concat([Buffer.from("p"), (() => { const b = Buffer.alloc(4 + pwd.length); b.writeInt32BE(b.length, 0); pwd.copy(b, 4); return b; })()]);
            socket.write(msg); return;
          }
          if (code === 5) {
            const salt = body.subarray(4, 8);
            const hash = md5Auth(conn.user, conn.password, salt);
            const pwd = Buffer.from(hash + "\0");
            const b = Buffer.alloc(4 + pwd.length); b.writeInt32BE(b.length, 0); pwd.copy(b, 4);
            socket.write(Buffer.concat([Buffer.from("p"), b])); return;
          }
          if (code === 10 || code === 11 || code === 12) {
            reject(new Error("SASL auth requerido — este mini-cliente só suporta md5/cleartext. Use SCRAM via psql."));
            socket.destroy(); return;
          }
          reject(new Error(`Método de autenticação não suportado: ${code}`));
          socket.destroy(); return;
        }
        if (type === "S" || type === "K" || type === "N") return; // ParameterStatus/BackendKeyData/Notice
        if (type === "E") { reject(new Error("Erro de conexão: " + body.toString("utf8"))); socket.destroy(); return; }
      } else if (state === "query") {
        if (type === "T") return; // RowDescription
        if (type === "C") return; // CommandComplete
        if (type === "Z") { resolve(out); socket.end(); return; } // ReadyForQuery
        if (type === "E") { reject(new Error("Erro SQL: " + body.toString("utf8"))); socket.destroy(); return; }
      }
    }

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (buffer.length < 5) return;
        const type = buffer.toString("ascii", 0, 1);
        const len = buffer.readInt32BE(1);
        if (buffer.length < len + 1) return;
        const body = buffer.subarray(5, 1 + len);
        buffer = buffer.subarray(1 + len);

        if (state === "startup" && type === "R") {
          state = "auth";
          handleMessage(type, body);
        } else if (state === "auth") {
          handleMessage(type, body);
        } else if (state === "query") {
          handleMessage(type, body);
        }
      }
    });

    socket.on("connect", () => {});
    socket.on("error", (e) => reject(new Error("Erro de rede: " + e.message)));
    socket.on("timeout", () => { reject(new Error("Timeout de conexão")); socket.destroy(); });
    socket.on("close", () => { if (state !== "done" && out.length === 0) { /* fechado após resolve é ok */ } });

    // Após autenticação concluída (state passa de params), envia a query.
    const sendQuery = () => {
      state = "query";
      const q = Buffer.from(sql + "\0");
      const b = Buffer.alloc(4 + q.length); b.writeInt32BE(b.length, 0); q.copy(b, 4);
      socket.write(Buffer.concat([Buffer.from("Q"), b]));
    };
    // Detecta transição auth->params->query: quando recebe 'S' após auth ok.
    const origHandle = handleMessage.bind(null);
    socket.on("data", () => {}); // placeholder (handler acima processa)
    // Simples polling de estado: quando state === 'params', envia query.
    const timer = setInterval(() => {
      if (state === "params") { clearInterval(timer); sendQuery(); }
      if (state === "query" || state === "auth") { /* aguarda */ }
    }, 5);
    setTimeout(() => clearInterval(timer), 30000);
  });
}

async function main() {
  const file = process.argv[2] ?? "0001_convenios_financeiro.sql";
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada no .env");
    process.exit(1);
  }
  const conn = parseConn(process.env.DATABASE_URL);
  console.log(`Conectando a ${conn.host}:${conn.port}/${conn.database} (usuário ${conn.user})...`);

  const migrationPath = path.join(process.cwd(), "drizzle", "migrations", file);
  const sql = fs.readFileSync(migrationPath, "utf8");

  try {
    await runSql(conn, sql);
    console.log(`OK: ${file} aplicado.`);
  } catch (e) {
    console.error("Falhou:", e.message);
    process.exit(1);
  }
}

main();
