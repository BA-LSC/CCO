import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Read a deploy env var from process.env (inlined at build). Safe in RSC and SSG. */
export function readRuntimeEnv(name: string): string | undefined {
  const fromProcess = process.env[name]?.trim();
  return fromProcess || undefined;
}

/** Read a plain_text binding from the active Cloudflare worker request. */
export async function readWorkerBindingAsync(name: string): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const fromBinding = (env as Record<string, unknown>)[name];
    if (typeof fromBinding === "string" && fromBinding.trim()) {
      return fromBinding.trim();
    }
  } catch {
    // Outside a worker request — fall through.
  }

  return undefined;
}

/** Prefer process.env, then worker bindings (async only — never sync getCloudflareContext). */
export async function readRuntimeEnvAsync(name: string): Promise<string | undefined> {
  const fromProcess = readRuntimeEnv(name);
  if (fromProcess) return fromProcess;
  return readWorkerBindingAsync(name);
}
