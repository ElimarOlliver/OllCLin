// OllCLin - Cliente Postgres mínimo com SCRAM-SHA-256 e simple query
//
// Uso: node.cmd scripts/pg-client.mjs "<SQL>"
// Uso: node.cmd scripts/pg-client.mjs --file drizzle/migrations/0001_convenios_financeiro.sql
//
// Sem dependências externas: implementa protocolo Postgres 3.0 + SCRAM-SHA-256
// (RFC 5802/7677) + Simple Query. Suficiente para aplicar migrações SQL.

import "dotenv/config";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import { createHmac } from "node:crypto";

const url = new URL(process.env.DATABASE_URL ?? "");
const PG_USER = decodeURIComponent(url.username);
const PG_PASSWORD = decodeURIComponent(url.password);
const PG_DATABASE = url.pathname.replace(/^\//, "") || "postgres";
const PG_HOST = url.hostname;
const PG_PORT = Number(url.port || 5432);

/* ------------------------------ SCRAM helpers ----------------------------- */

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}
function hi(str, salt, iter) {
  return crypto.pbkdf2Sync(Buffer.from(str, "utf8"), salt, iter, 32, "sha256");
}

/* --------------------------- Protocolo Postgres --------------------------- */

class PgClient {
  constructor() {
    this.socket = null;
    this.buf = Buffer.alloc(0);
    this.onMessage = null;
    this.saslState = null;
    this.authOk = new Promise((resolve, reject) => {
      this.resolveAuth = resolve;
      this.rejectAuth = reject;
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection({ host: PG_HOST, port: PG_PORT });
      this.socket.setTimeout(30000);
      this.socket.on("connect", () => {
        // StartupMessage
        const payload = Buffer.from(`user\0${PG_USER}\0database\0${PG_DATABASE}\0\0`, "utf8");
        const len = 8 + payload.length;
        const msg = Buffer.alloc(len);
        msg.writeInt32BE(len, 0);
        msg.writeInt32BE(196608, 4); // protocol 3.0
        payload.copy(msg, 8);
        this.socket.write(msg);
      });
      this.socket.on("data", (d) => this.consume(d));
      this.socket.on("timeout", () => { this.socket.destroy(); reject(new Error("Timeout")); });
      resolve();
    });
  }

  consume(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (; ;) {
      if (this.buf.length < 5) return;
      const type = this.buf.toString("ascii", 0, 1);
      const len = this.buf.readInt32BE(1);
      if (len < 4 || len > 100 * 1024 * 1024) {
        console.error(`[proto] mensagem corrompida, tipo=${type} len=${len}`);
        this.buf = Buffer.alloc(0);
        return;
      }
      if (this.buf.length < len + 1) return;
      const body = this.buf.subarray(5, 1 + len);
      this.buf = this.buf.subarray(1 + len);
      this.handle(type, body);
    }
  }

  send(type, payload) {
    const b = Buffer.alloc(4 + payload.length);
    b.writeInt32BE(b.length, 0);
    payload.copy(b, 4);
    this.socket.write(Buffer.concat([Buffer.from(type, "ascii"), b]));
  }

  handle(type, body) {
    // Fase de query: mensagens vão para o dispatcher da query em curso
    if (this.onQueryResult) return this.consumeDispatch(type, body);

    if (type === "R") {
      const code = body.readInt32BE(0);
      if (code === 10) return this.beginScram(body);
      if (code === 11) {
        // SASLContinue: server-first-message (r=...,s=...,i=...)
        return this.finishScram(body);
      }
      if (code === 12) {
        // SASLFinal: verificar assinatura do servidor
        const finalAuth = body.subarray(4).toString("utf8");
        const vPart = finalAuth.split(",").find((s) => s.startsWith("v="));
        const serverSig = vPart ? vPart.slice(2) : null;
        if (serverSig && serverSig !== this.expectedServerSig) {
          this.rejectAuth(new Error("Assinatura do servidor inválida (MITM?)"));
          return;
        }
        // Servidor enviará AuthenticationOk (0) em seguida
        return;
      }
      if (code === 0) {
        if (this.onQueryResult) { /* fase de query — tratar abaixo */ }
        this.resolveAuth();
        return;
      }
      if (code === 3) {
        this.send("p", Buffer.from(PG_PASSWORD + "\0", "utf8"));
        return;
      }
      if (code === 5) {
        const salt = body.subarray(4, 8);
        const inner = crypto.createHash("md5").update(PG_PASSWORD + PG_USER).digest("hex");
        const resp = "md5" + crypto.createHash("md5").update(inner + salt.toString("hex")).digest("hex") + "\0";
        this.send("p", Buffer.from(resp, "utf8"));
        return;
      }
      this.rejectAuth(new Error("Auth não suportada: código " + code));
      return;
    }
    if (type === "v") {
      // NegotiateProtocolVersion: ignorar
      return;
    }
    if (type === "E") {
      const msg = parseError(body);
      this.rejectAuth(new Error("Erro do servidor durante autenticação: " + msg));
      return;
    }
    if (type === "Z") {
      // ReadyForQuery após auth bem-sucedida
      this.resolveAuth();
      return;
    }
    // S/K/N etc: ignorar
  }

  /* ------------------------------- SCRAM flow ------------------------------ */

  beginScram(body) {
    const mechanisms = body.subarray(4).toString("utf8").split("\0").filter(Boolean);
    if (!mechanisms.includes("SCRAM-SHA-256")) {
      this.rejectAuth(new Error("Servidor não oferece SCRAM-SHA-256"));
      return;
    }
    const nonce = crypto.randomBytes(18).toString("base64");
    this.clientFirstBare = `n=${PG_USER},r=${nonce}`;
    const clientFirst = `n,,${this.clientFirstBare}`;
    // SASLInitialResponse: mechanism\0 int32(len) client-first-message
    const mechBuf = Buffer.from("SCRAM-SHA-256\0", "utf8");
    const cfBuf = Buffer.from(clientFirst, "utf8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeInt32BE(cfBuf.length, 0);
    this.send("p", Buffer.concat([mechBuf, lenBuf, cfBuf]));
  }

  finishScram(body) {
    // SASLContinue: server-first-message após os 4 bytes do código
    const combined = body.subarray(4).toString("utf8");
    const parts = {};
    for (const seg of combined.split(",")) {
      const idx = seg.indexOf("=");
      if (idx > 0) parts[seg.slice(0, idx)] = seg.slice(idx + 1);
    }
    const serverNonce = parts.r;
    const salt = Buffer.from(parts.s, "base64");
    const iterations = parseInt(parts.i, 10);

    const nonceLocal = this.clientFirstBare.split(",")[1].slice(2);
    if (!serverNonce.startsWith(nonceLocal)) {
      this.rejectAuth(new Error("Nonce do servidor não corresponde"));
      return;
    }

    const clientFinalNoProof = `c=biws,r=${serverNonce}`;
    const saltedPassword = hi(PG_PASSWORD, salt, iterations);
    const clientKey = hmac(saltedPassword, Buffer.from("Client Key", "utf8"));
    const storedKey = crypto.createHash("sha256").update(clientKey).digest();
    const authMessage = Buffer.from(`${this.clientFirstBare},${combined},${clientFinalNoProof}`, "utf8");
    const clientSignature = hmac(storedKey, authMessage);
    const clientProof = Buffer.alloc(clientKey.length);
    for (let i = 0; i < clientKey.length; i++) clientProof[i] = clientKey[i] ^ clientSignature[i];

    const serverKey = hmac(saltedPassword, Buffer.from("Server Key", "utf8"));
    const serverSignature = hmac(serverKey, authMessage);
    this.expectedServerSig = serverSignature.toString("base64");

    const clientFinal = `${clientFinalNoProof},p=${clientProof.toString("base64")}`;
    this.send("p", Buffer.from(clientFinal, "utf8"));
  }

  /* -------------------------------- Queries -------------------------------- */

  async query(sql) {
    await this.authOk;
    return new Promise((resolve, reject) => {
      const messages = [];
      this.onQueryResult = (type, body) => {
        if (type === "Z") { this.onQueryResult = null; resolve(messages); return; }
        if (type === "s") return; // PortalSuspended (ignorar)
        messages.push({ type, body });
        if (type === "E") {
          const msg = parseError(body);
          this.onQueryResult = null;
          reject(new Error("Erro SQL: " + msg));
          // Envia Sync para recuperar o protocolo
          this.socket.write(Buffer.from("S\0\0\0\x04"));
        }
      };
      const q = Buffer.from(sql + "\0", "utf8");
      this.send("Q", q);
    });
  }

  /** Dispatch de mensagens em fase de query. */
  onQueryResult = null;

  consumeDispatch(type, body) {
    if (this.onQueryResult) this.onQueryResult(type, body);
  }
}

function parseError(body) {
  const fields = {};
  for (const seg of body.toString("utf8").split("\0")) {
    if (seg.length > 1) fields[seg[0]] = seg.slice(1);
  }
  return `${fields.C ?? ""} ${fields.M ?? ""}`.trim();
}

/* ---------------------------------- main ---------------------------------- */

async function main() {
  let sql;
  const args = process.argv.slice(2);
  if (args[0] === "--file") {
    sql = fs.readFileSync(args[1], "utf8");
  } else {
    sql = args.join(" ");
  }
  if (!sql) {
    console.error("Uso: node.cmd scripts/pg-client.mjs \"<SQL>\"  |  --file <caminho>");
    process.exit(1);
  }

  console.log(`Conectando: ${PG_HOST}:${PG_PORT} user=${PG_USER} db=${PG_DATABASE}`);
  const client = new PgClient();
  await client.start();

  try {
    // Aguarda autenticação concluída
    await Promise.race([
      client.authOk.then(() => console.log("✅ Autenticado")),
      new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout na autenticação")), 25000)),
    ]);

    const results = await client.query(sql);
    if (results.length === 0) {
      console.log("(sem linhas de resultado — possível erro acima)");
    }
    for (const m of results) {
      if (m.type === "C") {
        const tag = m.body.toString("utf8").replace(/\0$/, "");
        console.log("✔", tag);
      }
      if (m.type === "T") {
        // RowDescription: nomes das colunas
        const ncols = m.body.readInt16BE(0);
        let off = 2;
        const cols = [];
        for (let i = 0; i < ncols; i++) {
          const end = m.body.indexOf(0, off);
          cols.push(m.body.toString("utf8", off, end));
          off = end + 19;
        }
        console.log("\n" + cols.join(" | "));
        console.log("-".repeat(cols.join(" | ").length));
      }
      if (m.type === "D") {
        // DataRow: extrai valores text
        const vals = [];
        const ncols = m.body.readInt16BE(0);
        let off = 2;
        for (let i = 0; i < ncols; i++) {
          const vlen = m.body.readInt32BE(off); off += 4;
          vals.push(vlen === -1 ? "NULL" : m.body.toString("utf8", off, off + vlen));
          if (vlen > 0) off += vlen;
        }
        console.log("linha:", vals.join(" | "));
      }
      if (m.type === "N") {
        console.log("ℹ aviso:", parseError(m.body));
      }
    }
    console.log("\n✅ Comando executado.");
    client.socket.end();
    process.exit(0);
  } catch (e) {
    console.error("\nFalhou:", e.message);
    process.exit(1);
  }
  process.exit(0);
}

main();
