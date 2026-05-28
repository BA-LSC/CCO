import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import type { TokenResponse } from "@cco/pco-client";
import {
  enrichGroupsWithImages,
  PlanningCenterClient,
  fetchMyGroupRoles,
  fetchMyGroups,
} from "@cco/pco-client";
import { persistGroupSync } from "../services/group-sync";
import { reconcilePlaceholderUsersOnLogin } from "../services/user-account-merge";
import { isSetupComplete } from "../services/org-oauth";
import {
  ensureOrganizationForProfile,
  isPcoSiteAdministrator,
  resolvePostLoginRedirect,
  upsertUserFromPcoProfile,
  type PcoMeProfile,
} from "../services/setup";
import { syncServiceTeamsFromPco } from "../services/service-teams";
import {
  clearOAuthSyncError,
  readOAuthSyncError,
  setOAuthSyncError,
} from "../lib/oauth-sync-error";
import { scheduleBackgroundWork } from "../runtime/worker-context";
import { savePcoTokens } from "./pco-tokens";
import { signSession } from "./session";

/** Wait for post-login PCO sync before redirect; background continues on timeout. */
const OAUTH_GROUP_SYNC_TIMEOUT_MS = 10_000;

type PostLoginSyncParams = {
  organizationId: string;
  userId: string;
  accessToken: string;
  pcoPersonId: string;
};

async function runPostLoginSync(params: PostLoginSyncParams): Promise<string | undefined> {
  try {
    const client = new PlanningCenterClient({ accessToken: params.accessToken });
    const listed = await fetchMyGroups(client);
    const incoming = await enrichGroupsWithImages(client, listed);
    let memberships: Awaited<ReturnType<typeof fetchMyGroupRoles>> = [];
    try {
      memberships = await fetchMyGroupRoles(client, params.pcoPersonId, incoming);
    } catch {
      /* roles optional on first login */
    }
    await persistGroupSync({
      organizationId: params.organizationId,
      userId: params.userId,
      incoming,
      memberships,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Group sync failed";
    console.warn("Group sync after login failed:", message);
    await setOAuthSyncError(params.userId, message);
    return message;
  }

  try {
    await syncServiceTeamsFromPco({
      organizationId: params.organizationId,
      userId: params.userId,
      accessToken: params.accessToken,
      pcoPersonId: params.pcoPersonId,
    });
  } catch (err) {
    console.warn("Team sync after login failed:", err instanceof Error ? err.message : err);
  }

  await clearOAuthSyncError(params.userId);
  return undefined;
}

export type { PcoMeProfile as PcoProfileJson } from "../services/setup";

export type OAuthLoginResult =
  | {
      ok: true;
      userId: string;
      organizationId: string;
      sessionToken: string;
      pcoAccessToken: string;
      displayName: string;
      redirectTo: string;
      groupsSyncError?: string;
    }
  | { ok: false; status: number; message: string };

export async function completeOAuthLogin(
  profile: PcoMeProfile,
  token: TokenResponse,
  options?: { syncGroups?: boolean; requestedNext?: string | null },
): Promise<OAuthLoginResult> {
  if (profile.data.attributes.child) {
    return {
      ok: false,
      status: 403,
      message: "Users under 13 cannot use CCO chat per Planning Center policy.",
    };
  }

  const setupComplete = await isSetupComplete();
  const isOrgAdmin = isPcoSiteAdministrator(profile);
  const organizationId = await ensureOrganizationForProfile(profile);
  const displayName =
    [profile.data.attributes.first_name, profile.data.attributes.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "User";

  const userId = await upsertUserFromPcoProfile(organizationId, profile);

  await savePcoTokens(userId, token);
  await reconcilePlaceholderUsersOnLogin({ organizationId, userId });

  let groupsSyncError: string | undefined;
  const shouldSync = setupComplete && options?.syncGroups !== false;
  if (shouldSync) {
    await clearOAuthSyncError(userId);
    const syncWork = runPostLoginSync({
      organizationId,
      userId,
      accessToken: token.access_token,
      pcoPersonId: profile.data.id,
    });
    scheduleBackgroundWork(() => syncWork);

    const raced = await Promise.race([
      syncWork.then((error) => ({ kind: "done" as const, error })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        setTimeout(() => resolve({ kind: "timeout" }), OAUTH_GROUP_SYNC_TIMEOUT_MS);
      }),
    ]);

    if (raced.kind === "done" && raced.error) {
      groupsSyncError = raced.error;
    }
  }

  if (!groupsSyncError) {
    groupsSyncError = (await readOAuthSyncError(userId)) ?? undefined;
  }

  const sessionToken = await signSession({ userId, organizationId });
  const redirectTo = resolvePostLoginRedirect({
    setupComplete,
    isOrgAdmin,
    requestedNext: options?.requestedNext,
  });

  return {
    ok: true,
    userId,
    organizationId,
    sessionToken,
    pcoAccessToken: token.access_token,
    displayName,
    redirectTo,
    groupsSyncError,
  };
}

export function setSessionCookies(c: Context, sessionToken: string): void {
  setCookie(c, "connect_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}
