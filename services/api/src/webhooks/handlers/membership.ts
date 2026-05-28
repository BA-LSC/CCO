import {
  mapPcoMembershipRole,
  parseMembershipWebhookPayload,
  parsePersonAvatarUrl,
  type MembershipWebhookPayload,
} from "@cco/pco-client";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { groups, users } from "../../db/schema";
import { upsertUserFromPco } from "../../services/bootstrap";
import {
  ensureConversationMember,
  ensureGeneralConversation,
} from "../../services/conversations";
import {
  refreshUserGroupRoleFromPco,
  removeGroupMembership,
  upsertGroupMembership,
} from "../../services/group-sync";
import { getOrgPcoAccessToken } from "../../services/org-config";
import { getConfiguredOrganization } from "../../services/org-oauth";

export type { MembershipWebhookPayload };

export async function handleMembershipDestroyed(
  payload: MembershipWebhookPayload,
): Promise<boolean> {
  const parsed = parseMembershipWebhookPayload(payload);
  if (!parsed) {
    console.warn("PCO membership webhook missing person/group ids");
    return false;
  }
  return removeGroupMembership({
    pcoPersonId: parsed.pcoPersonId,
    pcoGroupId: parsed.pcoGroupId,
  });
}

export async function handleMembershipUpsert(
  payload: MembershipWebhookPayload,
): Promise<boolean> {
  const parsed = parseMembershipWebhookPayload(payload);
  if (!parsed) {
    console.warn("PCO membership webhook missing person/group ids");
    return false;
  }

  const { pcoPersonId, pcoGroupId, displayName, email } = parsed;

  const groupRow = await db
    .select({ id: groups.id, organizationId: groups.organizationId })
    .from(groups)
    .where(eq(groups.pcoGroupId, pcoGroupId))
    .limit(1);

  if (!groupRow[0]) {
    console.warn(`PCO membership webhook: group ${pcoGroupId} not found locally`);
    return false;
  }

  const organizationId =
    groupRow[0].organizationId ??
    (await getConfiguredOrganization())?.id ??
    null;
  if (!organizationId) return false;

  const userId = await upsertUserFromPco(organizationId, {
    personId: pcoPersonId,
    email: email ?? `${pcoPersonId}@placeholder.local`,
    displayName: displayName ?? "Member",
  });

  const rawRole = payload.data?.attributes?.role;
  if (typeof rawRole === "string" && rawRole.length > 0) {
    await upsertGroupMembership({
      groupId: groupRow[0].id,
      userId,
      role: mapPcoMembershipRole(rawRole),
    });
  } else {
    await upsertGroupMembership({
      groupId: groupRow[0].id,
      userId,
      role: "member",
    });

    const accessToken = await getOrgPcoAccessToken(organizationId);
    if (accessToken) {
      await refreshUserGroupRoleFromPco({
        groupId: groupRow[0].id,
        pcoGroupId,
        userId,
        pcoPersonId,
        accessToken,
      });
    }
  }

  const conversationId = await ensureGeneralConversation(groupRow[0].id);
  await ensureConversationMember(conversationId, userId);

  return true;
}

export async function handlePersonCreated(payload: {
  data: {
    id: string;
    attributes: {
      first_name?: string;
      last_name?: string;
      email?: string;
      avatar_url?: string;
      demographic_avatar_url?: string;
    };
  };
}): Promise<boolean> {
  const organizationId = (await getConfiguredOrganization())?.id ?? null;
  if (!organizationId) return false;

  const personId = payload.data.id;
  const displayName =
    [payload.data.attributes.first_name, payload.data.attributes.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "User";

  const email = payload.data.attributes.email ?? `${personId}@placeholder.local`;
  const avatarUrl = parsePersonAvatarUrl(payload.data.attributes);

  await upsertUserFromPco(organizationId, {
    personId,
    email,
    displayName,
    ...(avatarUrl ? { avatarUrl } : {}),
  });

  return true;
}

export async function handlePersonUpdated(payload: {
  data: {
    id: string;
    attributes: {
      first_name?: string;
      last_name?: string;
      email?: string;
      avatar_url?: string;
      demographic_avatar_url?: string;
    };
  };
}): Promise<boolean> {
  const personId = payload.data.id;
  const displayName =
    [payload.data.attributes.first_name, payload.data.attributes.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "User";

  const patch: { displayName: string; email?: string; avatarUrl?: string } = { displayName };
  if (payload.data.attributes.email) {
    patch.email = payload.data.attributes.email;
  }
  const avatarUrl = parsePersonAvatarUrl(payload.data.attributes);
  if (avatarUrl) {
    patch.avatarUrl = avatarUrl;
  }

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.pcoPersonId, personId))
    .returning({ id: users.id });

  return Boolean(updated[0]);
}
