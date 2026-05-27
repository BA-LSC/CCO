const ALGO = "AES-GCM";
const PREFIX = "enc:v1:";
const IV_BYTES = 12;

function decodeEncryptionKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  const isHex = /^[0-9a-fA-F]{64}$/.test(trimmed);
  const bytes = isHex
    ? Uint8Array.from(trimmed.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16))
    : new TextEncoder().encode(trimmed);
  if (bytes.length < 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be at least 32 bytes");
  }
  return bytes.slice(0, 32);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(raw: string): Promise<CryptoKey> {
  const keyBytes = decodeEncryptionKey(raw) as BufferSource;
  return crypto.subtle.importKey("raw", keyBytes, { name: ALGO }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plaintext: string, encryptionKeyRaw: string): Promise<string> {
  if (!encryptionKeyRaw.trim()) {
    return plaintext;
  }

  const key = await importKey(encryptionKeyRaw);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
  const cipherBytes = new Uint8Array(cipher);
  const tag = cipherBytes.slice(-16);
  const data = cipherBytes.slice(0, -16);
  return `${PREFIX}${bytesToBase64Url(iv)}.${bytesToBase64Url(tag)}.${bytesToBase64Url(data)}`;
}

export async function decryptSecret(value: string, encryptionKeyRaw: string): Promise<string> {
  if (!value.startsWith(PREFIX)) {
    return value;
  }
  if (!encryptionKeyRaw.trim()) {
    throw new Error("TOKEN_ENCRYPTION_KEY required to decrypt stored tokens");
  }

  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted token format");
  }

  const key = await importKey(encryptionKeyRaw);
  const iv = base64UrlToBytes(ivB64);
  const tag = base64UrlToBytes(tagB64);
  const data = base64UrlToBytes(dataB64);
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data);
  combined.set(tag, data.length);
  const plain = await crypto.subtle.decrypt({ name: ALGO, iv: iv as BufferSource }, key, combined);
  return new TextDecoder().decode(plain);
}
