import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";

function encryptionKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  const isHex = /^[0-9a-fA-F]{64}$/.test(raw);
  const key = isHex ? Buffer.from(raw, "hex") : Buffer.from(raw, "utf8");
  if (key.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be at least 32 bytes");
  }
  return key.subarray(0, 32);
}

function assertEncryptionKeyAvailable(): void {
  if (process.env.NODE_ENV === "production" && !encryptionKey()) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required in production");
  }
}

export function encryptSecret(plaintext: string): string {
  assertEncryptionKeyAvailable();
  const key = encryptionKey();
  if (!key) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) return value;

  const key = encryptionKey();
  if (!key) {
    throw new Error("TOKEN_ENCRYPTION_KEY required to decrypt stored tokens");
  }

  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
