/** Matches @Display Name or @uuid user ids embedded in message bodies. */
const MENTION_PATTERN = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/gi;

export function extractMentionedUserIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const userId = match[2];
    if (userId) ids.add(userId);
  }
  return [...ids];
}

export function formatMention(displayName: string, userId: string): string {
  return `@[${displayName}](${userId})`;
}

export function renderMentionBody(body: string): string {
  return body.replace(MENTION_PATTERN, "@$1");
}
