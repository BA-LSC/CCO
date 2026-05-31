import type { MemberReadReceipt } from "@/lib/api";

export function mergePeerLastReadAt(
  current: string | null,
  incoming: string | null | undefined,
): string | null {
  if (!incoming) return current;
  if (!current) return incoming;
  const incomingMs = new Date(incoming).getTime();
  const currentMs = new Date(current).getTime();
  if (Number.isNaN(incomingMs)) return current;
  if (Number.isNaN(currentMs)) return incoming;
  return incomingMs >= currentMs ? incoming : current;
}

export function mergeMemberReadReceipts(
  current: MemberReadReceipt[],
  incoming: MemberReadReceipt[] | undefined,
): MemberReadReceipt[] {
  if (!incoming?.length) return current;

  const byUserId = new Map(current.map((member) => [member.userId, member]));
  for (const member of incoming) {
    const existing = byUserId.get(member.userId);
    byUserId.set(member.userId, {
      ...existing,
      ...member,
      lastReadAt: mergePeerLastReadAt(existing?.lastReadAt ?? null, member.lastReadAt),
    });
  }
  return [...byUserId.values()];
}
