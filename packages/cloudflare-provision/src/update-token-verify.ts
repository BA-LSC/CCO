import {
  cfRequest,
  CloudflareApiError,
  verifyCloudflareApiToken,
} from "./cloudflare-api";
import { getZoneIdForHostname, listWorkerRoutes } from "./cloudflare-api-resources";

const WORKERS_SCRIPTS_HINT =
  "Add Account → Workers Scripts → Edit to the Cloudflare API token.";
const WORKERS_ROUTES_HINT =
  "Add Zone → Workers Routes → Edit for your chat and API hostnames on the Cloudflare API token.";

const SECRETS_STORE_HINT =
  "Add Account → Secrets Store → Write to the Cloudflare API token.";

function enrichCloudflareAuthMessage(err: CloudflareApiError): string {
  if (
    /authentication (?:failed|error)/i.test(err.message) ||
    err.status === 403
  ) {
    const base = err.message.includes("Secrets Store")
      ? err.message
      : `${err.message} Paste a new Cloudflare API token in Admin Settings → Cloudflare (recovery tokens expire).`;
    return `${base} ${WORKERS_SCRIPTS_HINT} ${WORKERS_ROUTES_HINT} ${SECRETS_STORE_HINT}`;
  }
  return err.message;
}

async function assertSecretsStoreAccess(accountId: string, apiToken: string): Promise<void> {
  await cfRequest<Array<{ id: string }>>(
    apiToken,
    `/accounts/${accountId}/secrets_store/stores`,
  );
}

async function assertWorkerScriptsAccess(accountId: string, apiToken: string): Promise<void> {
  await cfRequest<Array<{ id: string }>>(
    apiToken,
    `/accounts/${accountId}/workers/scripts`,
  );
}

async function assertWorkerRoutesAccess(
  apiToken: string,
  hostname: string,
  label: string,
): Promise<void> {
  const zoneId = await getZoneIdForHostname(apiToken, hostname);
  if (!zoneId) {
    throw new CloudflareApiError(
      `No Cloudflare zone found for ${label} hostname "${hostname}". Add the domain to this account.`,
      404,
    );
  }
  await listWorkerRoutes(zoneId, apiToken);
}

export type VerifyCloudflareUpdateApplyParams = {
  accountId: string;
  apiToken: string;
  chatHostname: string;
  apiHostname: string;
};

/**
 * Preflight Cloudflare credentials before Admin Updates apply.
 * Surfaces auth code 10000-style failures with actionable token scope hints.
 */
export async function verifyCloudflareUpdateApplyPermissions(
  params: VerifyCloudflareUpdateApplyParams,
): Promise<void> {
  const apiToken = params.apiToken.trim();
  if (!apiToken) {
    throw new CloudflareApiError("Cloudflare API token is required", 400);
  }

  try {
    const verified = await verifyCloudflareApiToken(apiToken);
    if (verified.status !== "active") {
      throw new CloudflareApiError("Cloudflare API token is not active", 403);
    }

    await assertWorkerScriptsAccess(params.accountId, apiToken);
    await assertSecretsStoreAccess(params.accountId, apiToken);
    await assertWorkerRoutesAccess(apiToken, params.apiHostname, "API");
    if (params.chatHostname !== params.apiHostname) {
      await assertWorkerRoutesAccess(apiToken, params.chatHostname, "chat");
    }
  } catch (err) {
    if (err instanceof CloudflareApiError) {
      throw new CloudflareApiError(enrichCloudflareAuthMessage(err), err.status);
    }
    throw new CloudflareApiError(
      err instanceof Error ? err.message : "Cloudflare API request failed",
      403,
    );
  }
}
