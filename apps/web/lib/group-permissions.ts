const LEADER_ROLES = new Set(["leader", "admin"]);

export function isGroupLeaderRole(role: string | undefined): boolean {
  return Boolean(role && LEADER_ROLES.has(role));
}

export function canPostInGroupChannel(params: {
  membershipRole: string | undefined;
  leaderOnly: boolean;
}): boolean {
  if (!params.leaderOnly) return true;
  return isGroupLeaderRole(params.membershipRole);
}
