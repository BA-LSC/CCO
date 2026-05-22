type MemberAvatarSource = {
  id?: string;
  avatarUrl?: string | null;
};

type SessionAvatarSource = {
  userId?: string;
  avatarUrl?: string | null;
} | null | undefined;

export function resolveMemberAvatarUrl(
  member: MemberAvatarSource,
  session?: SessionAvatarSource,
): string | null | undefined {
  if (member.id && member.id === session?.userId) {
    return session?.avatarUrl ?? member.avatarUrl;
  }
  return member.avatarUrl;
}
