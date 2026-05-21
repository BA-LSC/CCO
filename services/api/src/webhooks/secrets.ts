import { decryptSecret, encryptSecret } from "../auth/token-crypto";

/** Split user input into unique non-empty webhook secrets (one per PCO subscription). */
export function parseWebhookSecretsInput(raw: string): string[] {
  const secrets = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set(secrets)];
}

export function encryptWebhookSecrets(secrets: string[]): string | null {
  const normalized = parseWebhookSecretsInput(secrets.join("\n"));
  if (normalized.length === 0) return null;
  return encryptSecret(JSON.stringify(normalized));
}

export function encryptWebhookSecretsInput(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return encryptWebhookSecrets(parseWebhookSecretsInput(raw));
}

/** Decrypt stored webhook secrets. Legacy installs store a single plaintext secret. */
export function decryptWebhookSecrets(enc: string | null | undefined): string[] {
  if (!enc) return [];
  const plain = decryptSecret(enc);
  try {
    const parsed: unknown = JSON.parse(plain);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((item) => typeof item === "string" && item.length > 0)
    ) {
      return parsed;
    }
  } catch {
    /* legacy single secret */
  }
  const trimmed = plain.trim();
  return trimmed ? [trimmed] : [];
}
