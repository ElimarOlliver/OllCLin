// OllCLin - Diagnóstico Postgres: startup packet correto (protocolo 3.0)
//
// Uso: node.cmd scripts/probe-startup.mjs
// Envia StartupMessage padronizada e imprime TODOS os campos de resposta.

import "dotenv/config";
import net from "node:net";

const url = new URL(process.env.DATABASE_URL ?? "");
const user = decodeURIComponent(url.username);
const database = url.pathname.replace(/^\//, "") || "postgres";

console.log(`user=${user} database=${database} host=${url.hostname} port=${url.port}\n`);

function buildStartup() {
  const parts = [];
  parts.push("user\0" + user + "\0");
  parts.push("database\0" + database + "\0");
  parts.push("client_encoding\0UTF8\0");
  parts.push("\0");
  const payload = Buffer.from(parts.join(""), "utf8");
  const len = 4 + 4 + payload.length;
  const msg = Buffer.alloc(len);
  msg.writeInt32BE(len, 0);
  msg.writeInt32BE(196608, 4); // 3.0
  payload.copy(msg, 8);
  return msg;
}

const socket = net.createConnection({ host: url.hostname, port: Number(url.port || 6543) });
socket.setTimeout(12000);

socket.on("connect", () => socket.write(buildStartup()));

let buf = Buffer.alloc(0);
socket.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  while (buf.length >= 5) {
    const type = buf.toString("ascii", 0, 1);
    const len = buf.readInt32BE(1);
    if (buf.length < len + 1) break;
    const body = buf.subarray(5, 1 + len);
    buf = buf.subarray(1 + len);
    console.log(`<< tipo=${type} len=${len}`);
    if (type === "R") {
      const code = body.readInt32BE(0);
      console.log(`   Authentication request code=${code}`);
      if (code === 0) console.log("✅ AUTENTICADO");
    } else if (type === "E") {
      console.log("   ERRO detalhado:");
      console.log(body.toString("utf8").replace(/\x00/g, "\n   "));
      socket.destroy();
      process.exit(1);
    } else if (type === "Z") {
      console.log("✅ ReadyForQuery — conexão útil");
      socket.destroy();
      process.exit(0);
    } else if (type === "S") {
      // ParameterStatus
      const kv = body.toString("utf8").split("\0").filter(Boolean);
      console.log(`   Param: ${kv.join(" = ")}`);
    }
  }
});

socket.on("timeout", () => { console.log("⏱ Timeout"); socket.destroy(); });
socket.on("error", (e) => console.log("❌ Rede:", e.message));
