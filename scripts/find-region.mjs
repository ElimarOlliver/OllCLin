// OllCLin - Varredura de regiões do pooler Supabase para achar o tenant correto
//
// O erro "tenant/user ... not found" indica que o projeto está em outra região.
// Este script conecta em cada região conhecida e informa onde o tenant existe
// (resposta = pedido de autenticação SCRAM) vs. não existe (ENOTFOUND).

import "dotenv/config";
import net from "node:net";
import dns from "node:dns/promises";

const USER = decodeURIComponent(new URL(process.env.DATABASE_URL).username);

const REGIONS = [
  "aws-0-us-east-1", "aws-0-us-west-1", "aws-0-us-west-2",
  "aws-0-eu-central-1", "aws-0-eu-west-1", "aws-0-eu-west-2", "aws-0-eu-west-3",
  "aws-0-ap-southeast-1", "aws-0-ap-southeast-2", "aws-0-ap-northeast-1",
  "aws-0-ap-south-1", "aws-0-ca-central-1", "aws-0-sa-east-1",
  "aws-1-sa-east-1", "aws-1-us-east-1", "aws-1-eu-west-1", "aws-2-eu-central-1",
];

function probe(host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 6543 });
    socket.setTimeout(8000);
    let done = false;
    const finish = (result) => { if (!done) { done = true; socket.destroy(); resolve(result); } };

    socket.on("connect", () => {
      const payload = Buffer.from(`user\0${USER}\0database\0postgres\0\0`, "utf8");
      const len = 8 + payload.length;
      const msg = Buffer.alloc(len);
      msg.writeInt32BE(len, 0);
      msg.writeInt32BE(196608, 4);
      payload.copy(msg, 8);
      socket.write(msg);
    });

    let buf = Buffer.alloc(0);
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 5 && !done) {
        const type = buf.toString("ascii", 0, 1);
        const len = buf.readInt32BE(1);
        if (buf.length < len + 1) break;
        const body = buf.subarray(5, 1 + len);
        buf = buf.subarray(1 + len);
        if (type === "R") {
          const code = body.readInt32BE(0);
          finish(code === 10 || code === 3 || code === 5 ? "TENANT_EXISTE(auth=" + code + ")" : "auth_desconhecida=" + code);
        } else if (type === "E") {
          const txt = body.toString("utf8");
          finish(txt.includes("ENOTFOUND") ? "tenant_nao_existe" : "erro:" + txt.replace(/\0/g, " ").trim().slice(0, 80));
        }
      }
    });
    socket.on("timeout", () => finish("timeout"));
    socket.on("error", (e) => finish("rede:" + e.code));
  });
}

async function main() {
  console.log(`Procurando tenant '${USER}' nas regiões do pooler...\n`);
  for (const region of REGIONS) {
    const host = `${region}.pooler.supabase.com`;
    let ip;
    try {
      ip = (await dns.resolve4(host))[0];
    } catch {
      console.log(`${region}: (região não existe)`);
      continue;
    }
    const result = await probe(host);
    const marker = result.startsWith("TENANT_EXISTE") ? "  <<<< PROJETO ESTÁ AQUI" : "";
    console.log(`${region}: ${result}${marker}`);
    if (result.startsWith("TENANT_EXISTE")) {
      console.log(`\n🎯 DATABASE_URL correta:\npostgresql://${USER}:SUA_SENHA@${region}.pooler.supabase.com:6543/postgres`);
      break;
    }
  }
}

main();
