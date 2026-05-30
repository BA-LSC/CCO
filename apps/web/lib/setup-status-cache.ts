import type { SetupStatus } from "@/lib/setup";

export const SETUP_STATUS_CACHE_KEY = "cco:setup-status";

type CachedSetupStatus = {
  configured: boolean;
  churchName?: string | null;
  updatedAt: number;
};

export function readCachedSetupStatus(): CachedSetupStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETUP_STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSetupStatus;
    if (typeof parsed.configured !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readCachedSetupConfigured(): boolean {
  return readCachedSetupStatus()?.configured === true;
}

export function writeCachedSetupStatus(status: SetupStatus): void {
  if (typeof window === "undefined") return;
  if (!status.configured) return;
  try {
    const payload: CachedSetupStatus = {
      configured: true,
      churchName: status.churchName ?? null,
      updatedAt: Date.now(),
    };
    localStorage.setItem(SETUP_STATUS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearCachedSetupStatus(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(SETUP_STATUS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
