// OllCLin - Seed de dados de demonstração (NÃO sensíveis)
//
// Uso: node.cmd scripts/seed.mjs
//
// Cria (se não existirem):
// - Organização demo "Clinica Demo OllCLin" (id 1)
// - Formas de recebimento padrão (REQ-08-027..035)
// - 2 convênios demo
// - Receitas de demonstração nos status a_receber/recebido
//
// Idempotente: verifica cada registro antes de inserir.

import "dotenv/config";
import net from "node:net";
import crypto from "node:crypto";
import { createHmac } from "node:crypto";

const url = new URL(process.env.DATABASE_URL ?? "");
const PG_USER = decodeURIComponent(url.username);
const PG_PASSWORD = decodeURIComponent(url.password);
const PG_DATABASE = url.pathname.replace(/^\//, "") || "postgres";
const PG_HOST = url.hostname;
const PG_PORT = Number(url.port || 5432);

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}
function hi(str, salt, iter) {
  return crypto.pbkdf2Sync(Buffer.from(str, "utf8"), salt, iter, 32, "sha256");
}

class PgClient {
  constructor() {
    this.socket = null;
    this.buf = Buffer.alloc(0);
    this.onQueryResult = null;
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
        const payload = Buffer.from(`user\0${PG_USER}\0database\0${PG_DATABASE}\0\0`, "utf8");
        const len = 8 + payload.length;
        const msg = Buffer.alloc(len);
        msg.writeInt32BE(len, 0);
        msg.writeInt32BE(196608, 4);
        payload.copy(msg, 8);
        this.socket.write(msg);
      });
      this.socket.on("data", (d) => this.consume(d));
      this.socket.on("error", (e) => reject(new Error("Rede: " + e.message)));
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
      if (len < 4 || len > 100 * 1024 * 1024) { this.buf = Buffer.alloc(0); return; }
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
    if (this.onQueryResult) return this.consumeDispatch(type, body);

    if (type === "R") {
      const code = body.readInt32BE(0);
      if (code === 10) return this.beginScram(body);
      if (code === 11) return this.finishScram(body);
      if (code === 12) {
        const finalAuth = body.subarray(4).toString("utf8");
        const vPart = finalAuth.split(",").find((s) => s.startsWith("v="));
        const serverSig = vPart ? vPart.slice(2) : null;
        if (serverSig && serverSig !== this.expectedServerSig) {
          this.rejectAuth(new Error("Assinatura do servidor inválida (MITM?)"));
          return;
        }
        return;
      }
      if (code === 0) { this.resolveAuth(); return; }
      if (code === 3) { this.send("p", Buffer.from(PG_PASSWORD + "\0", "utf8")); return; }
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
    if (type === "v") return;
    if (type === "E") {
      this.rejectAuth(new Error("Erro durante autenticação: " + parseError(body)));
      return;
    }
  }

  beginScram(body) {
    const mechanisms = body.subarray(4).toString("utf8").split("\0").filter(Boolean);
    if (!mechanisms.includes("SCRAM-SHA-256")) {
      this.rejectAuth(new Error("Servidor não oferece SCRAM-SHA-256"));
      return;
    }
    const nonce = crypto.randomBytes(18).toString("base64");
    this.clientFirstBare = `n=${PG_USER},r=${nonce}`;
    const clientFirst = `n,,${this.clientFirstBare}`;
    const mechBuf = Buffer.from("SCRAM-SHA-256\0", "utf8");
    const cfBuf = Buffer.from(clientFirst, "utf8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeInt32BE(cfBuf.length, 0);
    this.send("p", Buffer.concat([mechBuf, lenBuf, cfBuf]));
  }

  finishScram(body) {
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
    this.expectedServerSig = hmac(serverKey, authMessage).toString("base64");

    this.send("p", Buffer.from(`${clientFinalNoProof},p=${clientProof.toString("base64")}`, "utf8"));
  }

  query(sql) {
    return new Promise((resolve, reject) => {
      const messages = [];
      this.onQueryResult = (type, body) => {
        if (type === "Z") { this.onQueryResult = null; resolve(messages); return; }
        if (type === "s") return;
        messages.push({ type, body });
        if (type === "E") {
          const msg = parseError(body);
          this.onQueryResult = null;
          this.socket.write(Buffer.from("S\0\0\0\x04"));
          reject(new Error("Erro SQL: " + msg));
        }
      };
      this.send("Q", Buffer.from(sql + "\0", "utf8"));
    });
  }

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

/* --------------------------------- seed --------------------------------- */

async function seedScalar(client, sql) {
  try {
    const rows = await client.query(sql);
    const d = rows.find((m) => m.type === "D");
    if (!d) {
      console.error("  [seedScalar] sem DataRow para:", sql.slice(0, 80));
      return null;
    }
    const ncols = d.body.readInt16BE(0);
    let off = 2;
    const vlen = d.body.readInt32BE(off);
    return vlen === -1 ? null : d.body.toString("utf8", off + 4, off + 4 + vlen);
  } catch (e) {
    console.error("  consulta falhou:", e.message);
    return null;
  }
}

/** Executa INSERT/UPDATE ignorando erro de unicidade (ON CONFLICT manual). */
async function seedExec(client, sql) {
  try {
    await client.query(sql);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada");
    process.exit(1);
  }
  console.log(`Conectando: ${PG_HOST}:${PG_PORT}`);
  const client = new PgClient();
  await client.start();
  await client.authOk;
  console.log("✅ Autenticado\n");

  // 1. Organização demo
  const orgId = await seedScalar(client, "SELECT id::text FROM organizations WHERE name='Clinica Demo OllCLin' LIMIT 1");
  if (orgId) {
    console.log(`ℹ Organização demo já existe (id=${orgId})`);
  } else {
    const inserted = await client.query(
      "INSERT INTO organizations (name, trade_name) VALUES ('Clinica Demo OllCLin', 'Clinica Demo')",
    );
    const cmd = inserted.find((m) => m.type === "C");
    console.log("✔ organização demo:", cmd ? cmd.body.toString().replace(/\0/g, "").trim() : "ok");
  }
  const ORG = orgId ?? "1";

  // 2. Formas de recebimento (Nome e Tipo obrigatórios — REQ-08-030/032)
  const paymentMethods = [
    ["Dinheiro", "dinheiro", false],
    ["Pix", "pix", false],
    ["Cartão de Crédito", "cartao", true],
    ["Cartão de Débito", "cartao", false],
    ["Boleto", "boleto", true],
    ["Transferência Bancária", "transferencia", false],
    ["Convênio", "convenio", true],
  ];
  console.log("\nFormas de recebimento:");
  for (const [name, type, allowsInstallments] of paymentMethods) {
    const esc = name.replace(/'/g, "''");
    const exists = await seedScalar(
      client,
      `SELECT CASE WHEN exists(SELECT 1 FROM payment_methods WHERE organization_id=${ORG} AND name='${esc}') THEN '1' ELSE '0' END`,
    );
    if (exists === "1") {
      console.log(`  ℹ '${name}' já existe`);
    } else {
      await client.query(
        `INSERT INTO payment_methods (organization_id, name, type, allows_installments) VALUES (${ORG}, '${esc}', '${type}', ${allowsInstallments})`,
      );
      console.log(`  ✔ '${name}' (${type}${allowsInstallments ? ", parcelável" : ""})`);
    }
  }

  // 3. Convênios demo
  console.log("\nConvênios:");
  const plans = [
    ["Unimed Demo", "339678", "4.00"],
    ["Amil Demo", "326679", "4.00.00"],
  ];
  for (const [operatorName, ansCode, tissVersion] of plans) {
    const esc = operatorName.replace(/'/g, "''");
    const exists = await seedScalar(
      client,
      `SELECT CASE WHEN exists(SELECT 1 FROM health_plans WHERE organization_id=${ORG} AND operator_name='${esc}') THEN '1' ELSE '0' END`,
    );
    if (exists === "1") {
      console.log(`  ℹ '${operatorName}' já existe`);
    } else {
      await client.query(
        `INSERT INTO health_plans (organization_id, operator_name, ans_code, tiss_xml_version) VALUES (${ORG}, '${esc}', '${ansCode}', '${tissVersion}')`,
      );
      console.log(`  ✔ '${operatorName}' (ANS ${ansCode}, TISS ${tissVersion})`);
    }
  }

  // 4. Receitas demo
  console.log("\nReceitas:");
  const revCount = await seedScalar(
    client,
    `SELECT count(*)::text FROM revenues WHERE organization_id=${ORG}`,
  );
  if (revCount && revCount !== "0") {
    console.log(`  ℹ ${revCount} receita(s) já existem — pulando seed de receitas`);
  } else {
    const cashMethod = await seedScalar(client, `SELECT id::text FROM payment_methods WHERE organization_id=${ORG} AND type='pix' LIMIT 1`) ?? "1";
    const planId = await seedScalar(client, `SELECT id::text FROM health_plans WHERE organization_id=${ORG} LIMIT 1`) ?? "1";
    const receitas = [
      [cashMethod, planId, "150.00", "recebido", "Consulta cardiológica demo"],
      [cashMethod, planId, "350.00", "a_receber", "Retorno demo"],
      [cashMethod, "NULL", "80.00", "a_receber", "Exame laboratorial demo"],
      [cashMethod, planId, "220.00", "recebido", "Sessão fisioterapia demo"],
    ];
    for (const [methodId, hplan, amount, status, desc] of receitas) {
      const escDesc = desc.replace(/'/g, "''");
      await client.query(
        `INSERT INTO revenues (organization_id, payment_method_id, health_plan_id, amount, status, due_date, description) VALUES (${ORG}, ${methodId}, ${hplan}, ${amount}, '${status}', CURRENT_DATE, '${escDesc}')`,
      );
      console.log(`  ✔ ${desc} — R$ ${amount} (${status.replace("_", " ")})`);
    }
  }

  console.log("\n🎉 Seed concluído (idempotente — seguro reexecutar).");
  client.socket.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Falhou:", e.message);
  process.exit(1);
});
