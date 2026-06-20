// AES-256-GCM encryption for PHI at rest.
// The encryption key comes from the ENCRYPTION_KEY env var (64 hex chars = 32
// bytes). Generate one with:  openssl rand -hex 32
//
// We encrypt the JSON answer blob before it ever touches the database, so even
// someone with raw DB access cannot read intake answers without the key.

import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be set to 64 hex characters (run: openssl rand -hex 32)"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store as iv:tag:ciphertext, all base64
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** A URL-safe random token used in the secure "view submission" link. */
export function secureToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function randomId(): string {
  return crypto.randomBytes(16).toString("hex");
}
