/** KV phase codes written by the API during Apply update (see org-updates.ts). */
export const DEPLOY_PHASE_LABELS: Record<string, string> = {
  starting: "Starting update…",
  "checking-release": "Checking the latest release…",
  "downloading-release": "Downloading release files…",
  "verifying-access": "Verifying Cloudflare access…",
  "preparing-workers": "Preparing worker bundles…",
  "configuring-uploads": "Configuring file uploads…",
  "running-migrations": "Running database migrations…",
  "deploying-api": "Deploying API workers…",
  "deploying-chat": "Deploying chat app…",
  finalizing: "Saving the new version…",
  refreshing: "Refreshing this page…",
};

const FALLBACK_STEPS = [
  "Starting update…",
  "Downloading release files…",
  "Deploying workers…",
  "Finishing update…",
] as const;

export function labelForDeployPhase(phase: string | null | undefined): string | null {
  if (!phase) return null;
  return DEPLOY_PHASE_LABELS[phase] ?? null;
}

/** When the API has not published a phase yet, rotate plausible status text. */
export function fallbackDeployStatusMessage(elapsedMs: number, updating: boolean): string {
  if (!updating) return DEPLOY_PHASE_LABELS.refreshing;
  if (elapsedMs < 4_000) return FALLBACK_STEPS[0];
  if (elapsedMs < 12_000) return FALLBACK_STEPS[1];
  if (elapsedMs < 30_000) return FALLBACK_STEPS[2];
  return FALLBACK_STEPS[3];
}

export function resolveDeployStatusMessage(options: {
  phase?: string | null;
  updating: boolean;
  elapsedMs: number;
}): string {
  return (
    labelForDeployPhase(options.phase) ??
    fallbackDeployStatusMessage(options.elapsedMs, options.updating)
  );
}
