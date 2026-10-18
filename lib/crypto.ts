// AES-256-GCM encryption for PHI at rest.
// The encryption key comes from the ENCRYPTION_KEY env var (64 hex chars = 32
// bytes). Generate one with:  openssl rand -hex 32
//
// We encrypt the JSON answer blob before it ever touches the database, so even
// someone with raw DB access cannot read intake answers without the key.

import crypto from "crypto";

const ALGO = "aes-256-gcm";

// Validate a hex key and reject obviously unsafe values (wrong length, non-hex,
// or a degenerate key like all-zeros / one repeated byte that could slip in from
// a copied placeholder). A real `openssl rand -hex 32` key never trips these.
function parseKey(hex: string | undefined, label: string): Buffer {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${label} must be set to 64 hex characters (run: openssl rand -hex 32)`);
  }
  const key = Buffer.from(hex, "hex");
  const first = key[0];
  if (key.every((b) => b === first)) {
    throw new Error(`${label} looks like a placeholder (every byte is identical). Generate a real key: openssl rand -hex 32`);
  }
  return key;
}

function getKey(): Buffer {
  return parseKey(process.env.ENCRYPTION_KEY, "ENCRYPTION_KEY");
}

// Optional PREVIOUS key, used only to DECRYPT data written before a key rotation.
// Set ENCRYPTION_KEY to the new key and ENCRYPTION_KEY_OLD to the old one; new
// writes use the new key, old data still reads, and once everything has been
// re-saved the old key can be removed. Returns null when not rotating.
function getOldKey(): Buffer | null {
  const hex = process.env.ENCRYPTION_KEY_OLD;
  if (!hex) return null;
  try { return parseKey(hex, "ENCRYPTION_KEY_OLD"); } catch { return null; }
}

/**
 * Non-secret health check for the admin/compliance view. Reports whether the key
 * is configured and well-formed, and whether a rotation (old) key is present —
 * WITHOUT ever revealing the key itself.
 */
export function encryptionKeyStatus(): { configured: boolean; strong: boolean; rotationKeyConfigured: boolean } {
  let configured = false;
  let strong = false;
  try { getKey(); configured = true; strong = true; } catch {
    configured = !!process.env.ENCRYPTION_KEY;
    strong = false;
  }
  return { configured, strong, rotationKeyConfigured: !!process.env.ENCRYPTION_KEY_OLD };
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store as iv:tag:ciphertext, all base64
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

function decryptWith(key: Buffer, ivB64: string, tagB64: string, dataB64: string): string {
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  try {
    return decryptWith(getKey(), ivB64, tagB64, dataB64);
  } catch (err) {
    // During a key rotation, data written under the previous key still decrypts
    // with it (the GCM auth tag makes a wrong-key attempt fail cleanly, so this
    // fallback is safe). Re-saving that record then re-encrypts under the new key.
    const old = getOldKey();
    if (old) {
      try { return decryptWith(old, ivB64, tagB64, dataB64); } catch { /* fall through */ }
    }
    throw err;
  }
}

/** A URL-safe random token used in the secure "view submission" link. */
export function secureToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function randomId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/** Deterministic keyed hash of a value, for equality matching on encrypted
 *  data (a "blind index"). Same input → same output, so two records for the
 *  same client can be matched without ever storing the name in plaintext.
 *  Uses the encryption key, so it's useless to anyone without it. */
export function blindIndex(value: string): string {
  const norm = value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  return crypto.createHmac("sha256", getKey()).update(norm).digest("hex");
}
