/**
 * OllCLin — Cofre de credenciais fiscais (FISCAL.md §5, R05/R06/R10).
 *
 * Envelope encryption em duas camadas:
 *   1. `material + senha` cifrados com data_key da empresa (AES-256-GCM);
 *   2. data_key cifrada com a KEK derivada do segredo de ambiente.
 *
 * Banco guarda APENAS ciphertext + iv + tag — nunca o material em claro.
 * Descriptografar SÓ dentro do worker, SÓ pelo tempo do uso; `usar()` zera
 * os buffers em try/finally (R06).
 *
 * KEK: FISCAL_KMS_KEY_ID quando definida (produção); fallback para o mesmo
 * material do token-crypto para ambientes de desenvolvimento. Em produção com
 * KMS real (Supabase Vault / AWS KMS — pendência 4), trocar `kek()` pela
 * chamada ao provedor mantendo a mesma interface.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { certificados, cofreFiscal } from "../../../drizzle/schema/fiscal";
import type { StatusCredencial } from "./tipos";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "v1";

function kek(): Buffer {
  const explicit = process.env.FISCAL_KMS_KEY_ID?.trim();
  if (explicit) return createHash("sha256").update(`ollclin:fiscal-kek:${explicit}`).digest();
  const fallback =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!fallback) {
    throw new Error(
      "Configure FISCAL_KMS_KEY_ID (ou SUPABASE_SECRET_KEY) para cifrar credenciais fiscais.",
    );
  }
  return createHash("sha256").update(`ollclin:fiscal-kek:${fallback}`).digest();
}

interface Envelope {
  dataKeyCifrada: string; // base64 (iv:tag:ciphertext da data_key)
  payload: string; // base64 (iv:tag:ciphertext do material)
}

function cifrar(chave: Buffer, plain: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, chave, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

function decifrar(chave: Buffer, envelope: string): Buffer {
  const [ivB64, tagB64, dataB64] = envelope.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Envelope inválido");
  const d = createDecipheriv(ALGORITHM, chave, Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(dataB64, "base64")), d.final()]);
}

function zerar(...bufs: (Buffer | undefined)[]): void {
  for (const b of bufs) if (b) b.fill(0);
}

/** Cifra o segredo e grava apenas ciphertext no cofre. Nunca logar o material. */
export async function guardar(
  organizationId: number,
  material: string,
  senha: string | null,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  // 1. data_key efêmera por gravação
  const dataKey = randomBytes(32);
  try {
    // 2. payload cifrado pela data_key
    const payload = cifrar(
      dataKey,
      Buffer.concat([
        Buffer.from(material, "utf8"),
        Buffer.from([0]),
        Buffer.from(senha ?? "", "utf8"),
      ]),
    );
    // 3. data_key cifrada pela KEK
    const dataKeyCifrada = cifrar(kek(), dataKey);
    const envelope: Envelope = { dataKeyCifrada, payload };

    const [row] = await db
      .insert(cofreFiscal)
      .values({ organizationId, ciphertext: JSON.stringify(envelope) })
      .$returningId();
    return row.id;
  } finally {
    zerar(dataKey);
  }
}

/**
 * Descriptografa e executa `fn` com o material — o ÚNICO lugar onde o segredo
 * existe em memória. Buffers zerados em finally (R06).
 */
export async function usar<T>(
  organizationId: number,
  segredoRef: number,
  fn: (material: string, senha: string | null) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db
    .select()
    .from(cofreFiscal)
    .where(and(eq(cofreFiscal.id, segredoRef), isNull(cofreFiscal.revogadoEm)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Credencial fiscal não encontrada ou revogada");

  let envelope: Envelope;
  try {
    envelope = JSON.parse(row.ciphertext) as Envelope;
  } catch {
    throw new Error("Cofre fiscal corrompido");
  }

  const dataKey = decifrar(kek(), envelope.dataKeyCifrada);
  try {
    const payload = decifrar(dataKey, envelope.payload);
    const sep = payload.indexOf(0);
    const material = payload.subarray(0, sep).toString("utf8");
    const senha = sep < payload.length - 1 ? payload.subarray(sep + 1).toString("utf8") : null;
    try {
      return await fn(material, senha);
    } finally {
      zerar(payload);
    }
  } finally {
    zerar(dataKey);
  }
}

/** Status da credencial da empresa — SEM expor material (R07). */
export async function status(organizationId: number): Promise<StatusCredencial> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db
    .select()
    .from(certificados)
    .where(and(eq(certificados.organizationId, organizationId), eq(certificados.ativo, true)))
    .limit(1);
  const cert = rows[0];
  if (!cert) return { existe: false, valido: false };

  const agora = new Date();
  const valido = cert.validoAte > agora && !cert.revogadoEm;
  const diasRestantes = Math.ceil((cert.validoAte.getTime() - agora.getTime()) / 86_400_000);
  return {
    existe: true,
    valido,
    tipo: cert.tipo,
    validoAte: cert.validoAte,
    diasRestantes,
    venceEm: diasRestantes <= 30 ? diasRestantes : undefined,
    vencido: !valido,
  };
}

/** Revoga o registro no cofre (o ciphertext fica, mas não pode mais ser lido). */
export async function revogar(organizationId: number, segredoRef: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(cofreFiscal)
    .set({ revogadoEm: new Date() })
    .where(and(eq(cofreFiscal.id, segredoRef), eq(cofreFiscal.organizationId, organizationId)));
  await db
    .update(certificados)
    .set({ ativo: false })
    .where(and(eq(certificados.organizationId, organizationId), eq(certificados.segredoRef, String(segredoRef))));
}
