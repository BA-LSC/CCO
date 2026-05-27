import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Read a plain_text binding from the active Cloudflare worker request, if any. */
export function readWorkerBinding(name: string): string | undefined {
  try {
    const { env } = getCloudflareContext();
    const fromBinding = (env as Record<string, unknown>)[name];
    if (typeof fromBinding === "string" && fromBinding.trim()) {
      return fromBinding.trim();
    }
  } catch {
    // Outside a worker request (local next dev, tests) — fall through.
  }

  return undefined;
}

/** Read a deploy env var from process.env (inlined at build) or Cloudflare worker bindings. */
export function readRuntimeEnv(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  return readWorkerBinding(name);
}
