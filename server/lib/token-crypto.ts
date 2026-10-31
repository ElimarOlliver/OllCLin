/**
 * OllCLin - Criptografia de tokens externos (LGPD)
 *
 * Tokens OAuth (Google Calendar) são credenciais sensíveis. Eles são gravados
 * no banco cifrados com AES-256-GCM; o banco armazena apenas o envelope
 * `v1:<iv>:<tag>:<ciphertext>` em base64.
 *
 * Chave:
 * - `GOOGLE_TOKEN_ENCRYPTION_KEY` quando definida (recomendado em produção);
 * - caso contrário, deriva da `SUPABASE_SECRET_KEY`, que já é exclusiva do
 *   backend. Trocar essa chave exige reconectar as contas Google.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "v1";
const ALGORITHM = "aes-256-gcm";

function secretMaterial(): string {
  const explicit = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit) return `ollclin:google-token:${explicit}`;
  const fallback =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;
  if (!fallback) {
    throw new Error(
      "Configure GOOGLE_TOKEN_ENCRYPTION_KEY (ou SUPABASE_SECRET_KEY) para cifrar tokens do Google Calendar.",
    );
  }
  return `ollclin:google-token:${fallback}`;
}

function key(): Buffer {
  return createHash("sha256").update(secretMaterial()).digest();
}

/** Cifra um segredo para gravação no banco. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Decifra um segredo lido do banco. */
export function decryptSecret(envelope: string): string {
  const [prefix, ivB64, tagB64, dataB64] = envelope.split(":");
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Token cifrado em formato inválido");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
