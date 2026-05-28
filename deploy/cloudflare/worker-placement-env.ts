import type { WorkerPlacementDeploySetting } from "@cco/cloudflare-provision";

/** WORKER_PLACEMENT_MODE=smart|region (default smart); WORKER_PLACEMENT_REGION when mode=region. */
export function workerPlacementFromEnv(): WorkerPlacementDeploySetting {
  const modeRaw = process.env.WORKER_PLACEMENT_MODE?.trim().toLowerCase();
  const mode = modeRaw === "region" ? ("region" as const) : ("smart" as const);
  if (mode === "region") {
    const region = process.env.WORKER_PLACEMENT_REGION?.trim();
    return { mode, region: region || null };
  }
  return { mode: "smart" };
}
