import { conversationIdFromChatPath, isChatIndexPath, readLastChatPath } from "@/lib/last-chat-path";

export { conversationIdFromChatPath };

export function resolveActiveConversationId(pathname: string): string | null {
  const fromPath = conversationIdFromChatPath(pathname);
  if (fromPath) return fromPath;

  if (isChatIndexPath(pathname)) {
    const lastPath = readLastChatPath();
    return lastPath ? conversationIdFromChatPath(lastPath) : null;
  }

  return null;
}
