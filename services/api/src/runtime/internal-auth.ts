import { timingSafeEqual } from "node:crypto";
import { getWorkerContext } from "./worker-context";

const BEARER_PREFIX = "Bearer ";

/** Shared internal-route bearer check for Cloudflare Worker runtimes. */
export function getCfInternalSecret(): string | undefined {
  const fromWorker = getWorkerContext()?.vars.CF_INTERNAL_SECRET?.trim();
  if (fromWorker) return fromWorker;
  return process.env.CF_INTERNAL_SECRET?.trim() || undefined;
}

function timingSafeBearerMatch(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader?.startsWith(BEARER_PREFIX)) return false;
  const token = authHeader.slice(BEARER_PREFIX.length);
  try {
    return timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(secret, "utf8"));
  } catch {
    return false;
  }
}

export function verifyCfInternalAuth(authHeader: string | undefined): boolean {
  const secret = getCfInternalSecret();
  if (!secret) return false;
  return timingSafeBearerMatch(authHeader, secret);
}
