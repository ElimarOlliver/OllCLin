// OllCLin - Diagnóstico rápido: executa uma query SELECT e imprime as linhas
// Uso: node scripts/db-select.mjs "<SQL>"
import "dotenv/config";
import net from "node:net";
import crypto from "node:crypto";

const url = new URL(process.env.DATABASE_URL ?? "");
const USER = decodeURIComponent(url.username);
const PASSWORD = decodeURIComponent(url.password);
const DATABASE = url.pathname.replace(/^\//, "") || "postgres";
const HOST = url.hostname;
const PORT = Number(url.port || 5432);

const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
const hi = (s, salt, iter) => crypto.pbkdf2Sync(Buffer.from(s), salt, iter, 32, "sha256");

const sql = process.argv.slice(2).join(" ");
if (!sql) { console.error("Uso: node scripts/db-select.mjs \"<SELECT>\""); process.exit(1); }

const socket = net.createConnection({ host: HOST, port: PORT });
socket.setTimeout(30000);
let buf = Buffer.alloc(0);
let phase = "auth";
let scram = null;
const rows = [];
let cols = [];
let done = false;

function finish() {
  if (done) return;
  done = true;
  if (cols.length) console.log(cols.join(" | "));
  for (const r of rows) console.log(r.join(" | "));
  if (!cols.length) console.log("(sem colunas/linhas)");
  socket.destroy();
  process.exit(0);
}
function fail(msg) {
  console.error("Falhou:", msg);
  socket.destroy();
  process.exit(1);
}
function send(type, payload) {
  const b = Buffer.alloc(4 + payload.length);
  b.writeInt32BE(b.length, 0);
  payload.copy(b, 4);
  socket.write(Buffer.concat([Buffer.from(type), b]));
}
function parseErr(body) {
  const f = {};
  for (const seg of body.toString("utf8").split("\0")) if (seg.length > 1) f[seg[0]] = seg.slice(1);
  return `${f.C ?? ""} ${f.M ?? ""}`.trim();
}
function handle(type, body) {
  if (type === "R") {
    const code = body.readInt32BE(0);
    if (code === 10) {
      const mechanisms = body.subarray(4).toString("utf8").split("\0").filter(Boolean);
      const nonce = crypto.randomBytes(18).toString("base64");
      scram = { bare: `n=${USER},r=${nonce}` };
      const cf = `n,,${scram.bare}`;
      const mech = Buffer.from("SCRAM-SHA-256\0");
      const cfb = Buffer.from(cf);
      const len = Buffer.alloc(4); len.writeInt32BE(cfb.length, 0);
      send("p", Buffer.concat([mech, len, cfb]));
      return;
    }
    if (code === 11) {
      const combined = body.subarray(4).toString("utf8");
      const parts = {};
      for (const seg of combined.split(",")) { const i = seg.indexOf("="); if (i > 0) parts[seg.slice(0, i)] = seg.slice(i + 1); }
      const clientKey = hmac(hi(PASSWORD, Buffer.from(parts.s, "base64"), parseInt(parts.i, 10)), Buffer.from("Client Key"));
      const storedKey = crypto.createHash("sha256").update(clientKey).digest();
      const cfnp = `c=biws,r=${parts.r}`;
      const authMsg = Buffer.from(`${scram.bare},${combined},${cfnp}`);
      const sig = hmac(storedKey, authMsg);
      const proof = Buffer.alloc(clientKey.length);
      for (let i = 0; i < clientKey.length; i++) proof[i] = clientKey[i] ^ sig[i];
      send("p", Buffer.from(`${cfnp},p=${proof.toString("base64")}`));
      return;
    }
    if (code === 12) return; // SASLFinal: assinatura verificada implicitamente, aguarda Ok/Ready
    if (code === 0) return; // aguarda ReadyForQuery
    fail("auth código " + code);
    return;
  }
  if (type === "E") {
    if (phase === "auth") fail("auth: " + parseErr(body));
    else { console.error("Erro SQL:", parseErr(body)); send(Buffer.from("S\0\0\0\x04").slice(0, 5)); finish(); }
    return;
  }
  if (type === "Z") { if (phase === "auth") { phase = "query"; send("Q", Buffer.from(sql + "\0")); } else finish(); return; }
  if (phase !== "query") return;
  if (type === "T") {
    const n = body.readInt16BE(0); let off = 2; cols = [];
    for (let i = 0; i < n; i++) { const e = body.indexOf(0, off); cols.push(body.toString("utf8", off, e)); off = e + 19; }
    return;
  }
  if (type === "D") {
    const n = body.readInt16BE(0); let off = 2; const vals = [];
    for (let i = 0; i < n; i++) { const l = body.readInt32BE(off); off += 4; vals.push(l === -1 ? "NULL" : body.toString("utf8", off, off + l)); if (l > 0) off += l; }
    rows.push(vals);
    return;
  }
}
socket.on("connect", () => {
  const payload = Buffer.from(`user\0${USER}\0database\0${DATABASE}\0\0`);
  const len = 8 + payload.length;
  const msg = Buffer.alloc(len);
  msg.writeInt32BE(len, 0); msg.writeInt32BE(196608, 4);
  payload.copy(msg, 8);
  socket.write(msg);
});
socket.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  for (; ;) {
    if (buf.length < 5) return;
    const type = buf.toString("ascii", 0, 1);
    const len = buf.readInt32BE(1);
    if (buf.length < len + 1) return;
    const body = buf.subarray(5, 1 + len);
    buf = buf.subarray(1 + len);
    handle(type, body);
  }
});
socket.on("timeout", () => fail("timeout"));
socket.on("error", (e) => fail(e.message));
