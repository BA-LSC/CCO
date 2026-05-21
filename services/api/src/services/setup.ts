import type { TokenResponse } from "@cco/pco-client";
import { parsePersonAvatarUrl } from "@cco/pco-client";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import { organizations, users } from "../db/schema";

export type PcoMeProfile = {
  data: {
    id: string;
    attributes: {
      first_name?: string;
      last_name?: string;
      email?: string;
      child?: boolean;
      site_administrator?: boolean;
      demographic_avatar_url?: string;
      avatar_url?: string;
    };
    relationships?: {
      organization?: {
        data?: { id?: string; type?: string } | null;
      };
    };
  };
  included?: Array<{
    id: string;
    type: string;
    attributes?: {
      name?: string;
      subdomain?: string;
    };
  }>;
};

export async function fetchPcoMe(accessToken: string): Promise<PcoMeProfile | null> {
  const response = await fetch(
    "https://api.planningcenteronline.com/people/v2/me?include=organization",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) return null;
  return (await response.json()) as PcoMeProfile;
}

export function parsePcoOrganizationId(profile: PcoMeProfile): string | null {
  const relId = profile.data.relationships?.organization?.data?.id;
  if (relId) return relId;
  const includedOrg = profile.included?.find((item) => item.type === "Organization");
  return includedOrg?.id ?? null;
}

export function parsePcoOrganizationName(profile: PcoMeProfile): string | null {
  const includedOrg = profile.included?.find((item) => item.type === "Organization");
  return includedOrg?.attributes?.name ?? null;
}

export function parseChurchCenterSubdomain(profile: PcoMeProfile): string | null {
  const includedOrg = profile.included?.find((item) => item.type === "Organization");
  return includedOrg?.attributes?.subdomain ?? null;
}

export function isPcoSiteAdministrator(profile: PcoMeProfile): boolean {
  return profile.data.attributes.site_administrator === true;
}

export async function ensureOrganizationForProfile(profile: PcoMeProfile): Promise<string> {
  const pcoOrgId =
    parsePcoOrganizationId(profile) ?? process.env.PCO_ORGANIZATION_ID ?? "default-org";
  const orgName =
    parsePcoOrganizationName(profile) ?? process.env.ORGANIZATION_NAME ?? "My Church";

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.pcoOrganizationId, pcoOrgId))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const pending = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(isNull(organizations.setupCompletedAt), isNotNull(organizations.pcoClientId)),
    )
    .limit(1);

  if (pending[0]) {
    await db
      .update(organizations)
      .set({
        name: orgName,
        pcoOrganizationId: pcoOrgId,
        churchCenterSubdomain: parseChurchCenterSubdomain(profile),
      })
      .where(eq(organizations.id, pending[0].id));
    return pending[0].id;
  }

  const [created] = await db
    .insert(organizations)
    .values({
      name: orgName,
      pcoOrganizationId: pcoOrgId,
      churchCenterSubdomain: parseChurchCenterSubdomain(profile),
    })
    .returning({ id: organizations.id });

  return created.id;
}

export async function upsertUserFromPcoProfile(
  organizationId: string,
  profile: PcoMeProfile,
): Promise<string> {
  const displayName =
    [profile.data.attributes.first_name, profile.data.attributes.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "User";

  const personId = profile.data.id;
  const email = profile.data.attributes.email ?? `${personId}@placeholder.local`;
  const siteAdministrator = isPcoSiteAdministrator(profile);
  const avatarUrl = parsePersonAvatarUrl(profile.data.attributes as Record<string, unknown>);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.pcoPersonId, personId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(users)
      .set({
        organizationId,
        email,
        displayName,
        siteAdministrator,
        avatarUrl: avatarUrl ?? undefined,
      })
      .where(eq(users.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(users)
    .values({
      organizationId,
      pcoPersonId: personId,
      email,
      displayName,
      siteAdministrator,
      avatarUrl: avatarUrl ?? null,
    })
    .returning({ id: users.id });

  return created.id;
}

export type OAuthExchangeContext = {
  profile: PcoMeProfile;
  token: TokenResponse;
};

export function resolvePostLoginRedirect(params: {
  setupComplete: boolean;
  isOrgAdmin: boolean;
  requestedNext?: string | null;
}): string {
  if (!params.setupComplete) {
    if (!params.isOrgAdmin) return "/setup/denied";
    return "/setup";
  }

  const next = params.requestedNext;
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/groups";
}
