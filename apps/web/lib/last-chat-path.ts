export const LAST_CHAT_PATH_KEY = "cco:last-chat-path";

const PERSISTABLE_CHAT_PATH =
  /^\/(?:dms\/[^/?#]+|groups\/[^/?#]+\/c\/[^/?#]+|teams\/[^/?#]+)$/;

export function isPersistableChatPath(pathname: string): boolean {
  return PERSISTABLE_CHAT_PATH.test(pathname);
}

export function isChatIndexPath(pathname: string): boolean {
  return pathname === "/groups" || pathname === "/dms" || pathname === "/teams";
}

export function saveLastChatPath(pathname: string): void {
  if (!isPersistableChatPath(pathname)) return;
  try {
    localStorage.setItem(LAST_CHAT_PATH_KEY, pathname);
  } catch {
    /* ignore quota / private mode */
  }
}

export function readLastChatPath(): string | null {
  try {
    const stored = localStorage.getItem(LAST_CHAT_PATH_KEY);
    if (!stored || !isPersistableChatPath(stored)) return null;
    return stored;
  } catch {
    return null;
  }
}

export function conversationIdFromChatPath(pathname: string): string | null {
  const dm = pathname.match(/^\/dms\/([^/?#]+)/)?.[1];
  if (dm) return dm;

  const group = pathname.match(/^\/groups\/[^/?#]+\/c\/([^/?#]+)/)?.[1];
  if (group) return group;

  const team = pathname.match(/^\/teams\/([^/?#]+)/)?.[1];
  if (team) return team;

  return null;
}
