import {
  createRealtimeKitApp,
  listCloudflareAccounts,
  listRealtimeKitApps,
  listRealtimeKitPresets,
  verifyCloudflareApiToken,
} from "./cloudflare-api";

export const CCO_REALTIMEKIT_APP_NAME = "CCO Chat";

export type RealtimeKitPresetMapping = {
  host: string;
  member: string;
  guest: string;
};

export type RealtimeKitProvisionResult = {
  accountId: string;
  appId: string;
  appName: string;
  presets: RealtimeKitPresetMapping | null;
  createdApp: boolean;
};

function normalizePresetName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]/g, "");
}

function findPresetName(names: string[], ...candidates: string[]): string | null {
  const normalized = names.map((raw) => ({ raw, norm: normalizePresetName(raw) }));
  for (const candidate of candidates) {
    const target = normalizePresetName(candidate);
    const exact = normalized.find((entry) => entry.norm === target);
    if (exact) return exact.raw;
    const partial = normalized.find((entry) => entry.norm.includes(target) || target.includes(entry.norm));
    if (partial) return partial.raw;
  }
  return null;
}

export function matchPresetNames(names: string[]): RealtimeKitPresetMapping | null {
  if (names.length === 0) return null;

  const host = findPresetName(names, "host", "groupcallhost", "webinarhost");
  const guest = findPresetName(names, "guest");
  const member = findPresetName(
    names,
    "group_call_participant",
    "groupcallparticipant",
    "webinarparticipant",
    "participant",
  );

  if (!host || !member || !guest) return null;
  return { host, member, guest };
}

export function resolveCloudflareAccountId(
  accounts: Array<{ id: string }>,
  preferredAccountId?: string,
): string {
  if (accounts.length === 0) {
    throw new Error("Cloudflare API token has no accessible accounts");
  }

  if (preferredAccountId) {
    const match = accounts.find((account) => account.id === preferredAccountId);
    if (match) return match.id;
  }

  if (accounts.length === 1) return accounts[0]!.id;

  throw new Error(
    "Cloudflare API token can access multiple accounts. Scope the token to one account or configure CLOUDFLARE_ACCOUNT_ID.",
  );
}

export function resolveRealtimeKitAppSelection(
  apps: Array<{ id: string; name: string }> | null | undefined,
  options: { preferredAppId?: string; appName?: string },
): { id: string; name: string } | "create" {
  const list = apps ?? [];
  if (options.preferredAppId) {
    const existing = list.find((app) => app.id === options.preferredAppId);
    if (existing) return existing;
  }

  const targetName = (options.appName ?? CCO_REALTIMEKIT_APP_NAME).trim().toLowerCase();
  const byName = list.find((app) => app.name.trim().toLowerCase() === targetName);
  if (byName) return byName;

  if (list.length === 1) return list[0]!;

  return "create";
}

export type ProvisionRealtimeKitParams = {
  apiToken: string;
  organizationName?: string;
  existingAccountId?: string;
  existingAppId?: string;
  autoCreateApp?: boolean;
};

export async function provisionRealtimeKitFromApiToken(
  params: ProvisionRealtimeKitParams,
): Promise<RealtimeKitProvisionResult> {
  const apiToken = params.apiToken.trim();
  if (!apiToken) {
    throw new Error("Cloudflare API token is required");
  }

  const verified = await verifyCloudflareApiToken(apiToken);
  if (verified.status !== "active") {
    throw new Error("Cloudflare API token is not active");
  }

  const accounts = await listCloudflareAccounts(apiToken);
  const accountId = resolveCloudflareAccountId(accounts, params.existingAccountId?.trim());

  let apps: Array<{ id: string; name: string }>;
  try {
    apps = await listRealtimeKitApps(accountId, apiToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list RealtimeKit apps";
    throw new Error(
      `${message}. Ensure the token has Realtime Admin permission for this account.`,
    );
  }

  const appName = params.organizationName?.trim()
    ? `${params.organizationName.trim()} (${CCO_REALTIMEKIT_APP_NAME})`
    : CCO_REALTIMEKIT_APP_NAME;

  const selection = resolveRealtimeKitAppSelection(apps, {
    preferredAppId: params.existingAppId?.trim(),
    appName,
  });

  let app: { id: string; name: string };
  let createdApp = false;

  if (selection === "create") {
    if (!params.autoCreateApp) {
      throw new Error(
        `No RealtimeKit app found. Create one named "${CCO_REALTIMEKIT_APP_NAME}" in the Cloudflare dashboard or save again to create it automatically.`,
      );
    }
    app = await createRealtimeKitApp(accountId, apiToken, appName);
    createdApp = true;
  } else {
    app = selection;
  }

  let presets: RealtimeKitPresetMapping | null = null;
  try {
    const listed = await listRealtimeKitPresets(accountId, app.id, apiToken);
    presets = matchPresetNames(listed.map((preset) => preset.name));
  } catch {
    presets = null;
  }

  return {
    accountId,
    appId: app.id,
    appName: app.name,
    presets,
    createdApp,
  };
}
