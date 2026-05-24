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
import { savePcoTokens } from "./pco-tokens";
import { signSession } from "./session";

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
    try {
      const client = new PlanningCenterClient({ accessToken: token.access_token });
      const listed = await fetchMyGroups(client);
      const incoming = await enrichGroupsWithImages(client, listed);
      let memberships: Awaited<ReturnType<typeof fetchMyGroupRoles>> = [];
      try {
        memberships = await fetchMyGroupRoles(client, profile.data.id, incoming);
      } catch {
        /* roles optional on first login */
      }
      await persistGroupSync({ organizationId, userId, incoming, memberships });
    } catch (err) {
      groupsSyncError = err instanceof Error ? err.message : "Group sync failed";
      console.warn("Group sync after login failed:", groupsSyncError);
    }

    try {
      await syncServiceTeamsFromPco({
        organizationId,
        userId,
        accessToken: token.access_token,
        pcoPersonId: profile.data.id,
      });
    } catch (err) {
      console.warn("Team sync after login failed:", err instanceof Error ? err.message : err);
    }
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
