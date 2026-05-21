import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { groupMemberships, groups, users } from "../../db/schema";
import { ensureOrganization, upsertUserFromPco } from "../../services/bootstrap";
import { ensureConversationMembers, ensureGeneralConversation } from "../../services/conversations";
import {
  refreshUserGroupRoleFromPco,
  removeGroupMembership,
  syncGroupRoster,
} from "../../services/group-sync";
import { findLeaderAccessTokenForGroup, getOrgPcoAccessToken } from "../../services/org-config";

export type MembershipWebhookPayload = {
  data: {
    type: string;
    attributes: {
      person_id?: string;
      group_id?: string;
      role?: string;
    };
  };
};

export async function handleMembershipDestroyed(
  payload: MembershipWebhookPayload,
): Promise<boolean> {
  const pcoPersonId = payload.data.attributes.person_id;
  const pcoGroupId = payload.data.attributes.group_id;
  if (!pcoPersonId || !pcoGroupId) return false;
  return removeGroupMembership({ pcoPersonId, pcoGroupId });
}

async function syncMembershipRoleFromPco(params: {
  organizationId: string;
  groupId: string;
  pcoGroupId: string;
  userId: string;
  pcoPersonId: string;
}): Promise<void> {
  const leaderToken = await findLeaderAccessTokenForGroup(params.groupId);
  if (leaderToken) {
    try {
      await syncGroupRoster({
        organizationId: params.organizationId,
        groupId: params.groupId,
        pcoGroupId: params.pcoGroupId,
        accessToken: leaderToken,
      });
      return;
    } catch (err) {
      console.warn(`Webhook roster sync failed for group ${params.groupId}:`, err);
    }
  }

  const accessToken = await getOrgPcoAccessToken(params.organizationId);
  if (!accessToken) return;

  await refreshUserGroupRoleFromPco({
    groupId: params.groupId,
    pcoGroupId: params.pcoGroupId,
    userId: params.userId,
    pcoPersonId: params.pcoPersonId,
    accessToken,
  });
}

export async function handleMembershipUpsert(
  payload: MembershipWebhookPayload,
): Promise<boolean> {
  const pcoPersonId = payload.data.attributes.person_id;
  const pcoGroupId = payload.data.attributes.group_id;
  if (!pcoPersonId || !pcoGroupId) return false;

  const organizationId = await ensureOrganization();

  const groupRow = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.pcoGroupId, pcoGroupId))
    .limit(1);

  if (!groupRow[0]) return false;

  const userId = await upsertUserFromPco(organizationId, {
    personId: pcoPersonId,
    email: `${pcoPersonId}@placeholder.local`,
    displayName: "Member",
  });

  await db
    .insert(groupMemberships)
    .values({
      groupId: groupRow[0].id,
      userId,
      role: "member",
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [groupMemberships.groupId, groupMemberships.userId],
      set: { syncedAt: new Date() },
    });

  const conversationId = await ensureGeneralConversation(groupRow[0].id);
  await ensureConversationMembers(conversationId, groupRow[0].id);

  await syncMembershipRoleFromPco({
    organizationId,
    groupId: groupRow[0].id,
    pcoGroupId,
    userId,
    pcoPersonId,
  });

  return true;
}

export async function handlePersonUpdated(payload: {
  data: { id: string; attributes: { first_name?: string; last_name?: string; email?: string } };
}): Promise<boolean> {
  const personId = payload.data.id;
  const displayName =
    [payload.data.attributes.first_name, payload.data.attributes.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "User";

  const patch: { displayName: string; email?: string } = { displayName };
  if (payload.data.attributes.email) {
    patch.email = payload.data.attributes.email;
  }

  const updated = await db
    .update(users)
    .set(patch)
    .where(eq(users.pcoPersonId, personId))
    .returning({ id: users.id });

  return Boolean(updated[0]);
}

/** @internal Test helper — webhook path must not promote payload role to leader/admin. */
export function resolveWebhookMembershipRole(payloadRole: string | undefined): "member" {
  void payloadRole;
  return "member";
}
