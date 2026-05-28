import { CCO_INSTALL_ORIGIN } from "./install-origin.js";

/** Canonical release catalog served by setup-c.co (not the web asset hash manifest). */
export const CCO_RELEASE_INDEX_PATH = "/releases/release-index.json";

export const CCO_RELEASES_ORIGIN = CCO_INSTALL_ORIGIN;

export const CCO_RELEASE_INDEX_URL = `${CCO_RELEASES_ORIGIN}${CCO_RELEASE_INDEX_PATH}`;

/** Cloudflare cron for update checks — runs every 10 minutes. */
export const CCO_UPDATE_CHECK_CRON = "*/10 * * * *";

/** Minutes between scheduled update checks (matches {@link CCO_UPDATE_CHECK_CRON}). */
export const CCO_UPDATE_CHECK_INTERVAL_MINUTES = 10;

/** Legacy org DB field; scheduling uses {@link CCO_UPDATE_CHECK_INTERVAL_MINUTES}. */
export const AUTO_UPDATE_CHECK_INTERVAL_MIN_MINUTES = CCO_UPDATE_CHECK_INTERVAL_MINUTES;

/** Legacy default stored in org rows; not used for scheduling. */
export const AUTO_UPDATE_CHECK_INTERVAL_DEFAULT_MINUTES = 360;

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
