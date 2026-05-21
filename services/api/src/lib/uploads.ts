import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

export const PUBLIC_UPLOAD_URL =
  process.env.PUBLIC_UPLOAD_URL ?? "http://localhost:3001/uploads";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

function uploadSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for upload signing");
  return secret;
}

export function safeUploadPath(uploadDir: string, filename: string): string | null {
  if (!filename || filename.includes("\0")) return null;

  const base = path.basename(filename);
  if (base !== filename || base === "." || base === "..") return null;
  if (base.includes("/") || base.includes("\\")) return null;

  const resolvedDir = path.resolve(uploadDir);
  const resolved = path.resolve(resolvedDir, base);
  const relative = path.relative(resolvedDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;

  return resolved;
}

export function signUploadAccess(filename: string, expiresAt: number): string {
  return createHmac("sha256", uploadSigningSecret())
    .update(`${filename}:${expiresAt}`)
    .digest("hex");
}

export function verifyUploadSignature(
  filename: string,
  sig: string,
  expiresAt: number,
): boolean {
  if (!sig || !Number.isFinite(expiresAt)) return false;
  if (Math.floor(Date.now() / 1000) > expiresAt) return false;

  const expected = signUploadAccess(filename, expiresAt);
  if (sig.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

export function buildSignedUploadUrl(
  filename: string,
  ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
  publicBase = PUBLIC_UPLOAD_URL,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signUploadAccess(filename, expiresAt);
  const base = publicBase.replace(/\/$/, "");
  return `${base}/${filename}?sig=${sig}&exp=${expiresAt}`;
}

export function isAllowedAttachmentUrl(
  attachmentUrl: string,
  publicUploadUrl = PUBLIC_UPLOAD_URL,
): boolean {
  let allowed: URL;
  let candidate: URL;
  try {
    allowed = new URL(publicUploadUrl);
    candidate = new URL(attachmentUrl);
  } catch {
    return false;
  }

  if (allowed.protocol !== candidate.protocol) return false;
  if (allowed.host !== candidate.host) return false;

  const allowedPath = allowed.pathname.replace(/\/$/, "") || "";
  const candidatePath = candidate.pathname.replace(/\/$/, "");
  if (!candidatePath.startsWith(allowedPath)) return false;

  const filename = path.basename(candidate.pathname);
  if (!filename || filename === "." || filename === "..") return false;

  return safeUploadPath(getUploadDir(), filename) !== null;
}
