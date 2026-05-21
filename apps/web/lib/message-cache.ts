import type { Message } from "@/lib/api";

export type CachedConversationMessages = {
  messages: Message[];
  hasMore: boolean;
  fetchedAt: number;
};

const MAX_ENTRIES = 8;

/** LRU-ordered by last access (Map insertion order). */
const cache = new Map<string, CachedConversationMessages>();

function touch(conversationId: string, entry: CachedConversationMessages) {
  cache.delete(conversationId);
  cache.set(conversationId, entry);
}

function evictIfNeeded() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function getCachedMessages(conversationId: string): CachedConversationMessages | null {
  const entry = cache.get(conversationId);
  if (!entry) return null;
  touch(conversationId, entry);
  return entry;
}

export function setCachedMessages(
  conversationId: string,
  data: Pick<CachedConversationMessages, "messages" | "hasMore">,
): void {
  touch(conversationId, {
    messages: data.messages,
    hasMore: data.hasMore,
    fetchedAt: Date.now(),
  });
  evictIfNeeded();
}

export function invalidateConversation(conversationId: string): void {
  cache.delete(conversationId);
}

export function clearMessageCache(): void {
  cache.clear();
}
