import { CCO_INSTALL_ORIGIN } from "./install-origin.js";

/** Canonical release catalog served by setup-c.co (not the web asset hash manifest). */
export const CCO_RELEASE_INDEX_PATH = "/releases/release-index.json";

export const CCO_RELEASES_ORIGIN = CCO_INSTALL_ORIGIN;

export const CCO_RELEASE_INDEX_URL = `${CCO_RELEASES_ORIGIN}${CCO_RELEASE_INDEX_PATH}`;

/** Default interval for background update checks on BYO Cloudflare orgs (6 hours). */
export const CCO_UPDATE_CHECK_CRON = "0 */6 * * *";

export type ReleaseIndex = {
  version: string;
  gitRef: string;
  publishedAt: string;
  releasesBaseUrl: string;
};
