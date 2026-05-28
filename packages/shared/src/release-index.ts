import { CCO_INSTALL_ORIGIN } from "./install-origin.js";

/** Canonical release catalog served by setup-c.co (not the web asset hash manifest). */
export const CCO_RELEASE_INDEX_PATH = "/releases/release-index.json";

export const CCO_RELEASES_ORIGIN = CCO_INSTALL_ORIGIN;

export const CCO_RELEASE_INDEX_URL = `${CCO_RELEASES_ORIGIN}${CCO_RELEASE_INDEX_PATH}`;

/** Minimum org-configured interval between auto update checks (minutes). */
export const AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES = 10;

/** Default org interval when auto-install is enabled (6 hours). */
export const AUTO_UPDATE_CHECK_INTERVAL_DEFAULT_MINUTES = 360;

/** Cloudflare cron for update checks — runs every 10 minutes; org interval gates actual work. */
export const CCO_UPDATE_CHECK_CRON = "*/10 * * * *";

export function normalizeAutoUpdateCheckIntervalMinutes(
  value: number | null | undefined,
): number {
  if (value == null || !Number.isFinite(value)) {
    return AUTO_UPDATE_CHECK_INTERVAL_DEFAULT_MINUTES;
  }
  return Math.max(AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES, Math.floor(value));
}

export type ReleaseIndex = {
  version: string;
  gitRef: string;
  publishedAt: string;
  releasesBaseUrl: string;
};
