import type { GroupRole } from "@cco/shared/schemas";

const LEADER_ROLES: GroupRole[] = ["leader", "admin"];

export function isLeaderRole(role: string): boolean {
  return LEADER_ROLES.includes(role as GroupRole);
}

export function canPostInConversation(params: {
  membershipRole: string;
  leaderOnly: boolean;
}): boolean {
  if (!params.leaderOnly) return true;
  return isLeaderRole(params.membershipRole);
}

export function canCreateConversation(role: string): boolean {
  return isLeaderRole(role);
}

export function canDeleteMessage(params: {
  authorId: string;
  userId: string;
  membershipRole: string;
}): boolean {
  if (params.authorId === params.userId) return true;
  return isLeaderRole(params.membershipRole);
}
