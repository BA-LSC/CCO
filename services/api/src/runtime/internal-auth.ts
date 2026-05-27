import { getWorkerContext } from "./worker-context";

/** Shared internal-route bearer check for VPS and Cloudflare Worker runtimes. */
export function getCfInternalSecret(): string | undefined {
  const fromWorker = getWorkerContext()?.vars.CF_INTERNAL_SECRET?.trim();
  if (fromWorker) return fromWorker;
  return process.env.CF_INTERNAL_SECRET?.trim() || undefined;
}

export function verifyCfInternalAuth(authHeader: string | undefined): boolean {
  const secret = getCfInternalSecret();
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}
