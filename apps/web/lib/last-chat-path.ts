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
