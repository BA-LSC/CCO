import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { buildR2AttachmentUrl, resolveR2Config } from "./r2-uploads";

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

export const PUBLIC_UPLOAD_URL =
  process.env.PUBLIC_UPLOAD_URL ?? "http://localhost:3001/uploads";

export async function isR2StorageEnabled(): Promise<boolean> {
  if (process.env.UPLOAD_STORAGE === "local") return false;
  return Boolean(await resolveR2Config());
}

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

const UPLOAD_PATH_RE = /\/(?:api\/v1\/|api\/)?uploads\/([^/?#]+)/;

const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** MIME type for a stored upload filename, when known. */
export function uploadContentTypeForFilename(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  return UPLOAD_CONTENT_TYPES[ext];
}

/** Extract the stored filename from a public or relative upload URL. */
export function extractUploadFilename(urlOrPath: string): string | null {
  if (!urlOrPath) return null;

  try {
    const match = new URL(urlOrPath).pathname.match(UPLOAD_PATH_RE);
    return match?.[1] ?? null;
  } catch {
    const match = urlOrPath.match(/^\/?(?:api\/v1\/|api\/)?uploads\/([^/?#]+)/);
    return match?.[1] ?? null;
  }
}

/** Re-sign upload URLs so clients always receive a valid, non-expired attachment link. */
export function refreshAttachmentUrl(stored: string | null): string | null {
  if (!stored) return null;
  const filename = extractUploadFilename(stored);
  if (!filename) return stored;

  if (process.env.CLOUDFLARE_R2_BUCKET?.trim() || process.env.UPLOAD_STORAGE === "r2") {
    return buildSignedUploadUrl(filename);
  }

  if (safeUploadPath(getUploadDir(), filename) === null) return stored;
  return buildSignedUploadUrl(filename);
}

export async function refreshAttachmentUrlAsync(stored: string | null): Promise<string | null> {
  if (!stored) return null;
  const filename = extractUploadFilename(stored);
  if (!filename) return stored;

  if (await isR2StorageEnabled()) {
    const r2Url = await buildR2SignedUploadUrl(filename);
    if (r2Url) return r2Url;
  }

  return refreshAttachmentUrl(stored);
}

export async function buildR2SignedUploadUrl(filename: string): Promise<string | null> {
  return buildR2AttachmentUrl(filename);
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

  const filename = extractUploadFilename(attachmentUrl);
  if (!filename) return false;

  if (process.env.CLOUDFLARE_R2_BUCKET?.trim() || process.env.UPLOAD_STORAGE === "r2") {
    if (candidate.host.includes("r2.cloudflarestorage.com")) return true;
    if (allowed.host === candidate.host) return true;
  }

  if (allowed.protocol !== candidate.protocol) return false;
  if (allowed.host !== candidate.host) return false;

  return safeUploadPath(getUploadDir(), filename) !== null;
}
