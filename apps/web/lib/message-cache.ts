import type { Message } from "@/lib/api";
import type { CallTimelineEventDto } from "@/lib/call-timeline";

export type CachedConversationMessages = {
  messages: Message[];
  callEvents: CallTimelineEventDto[];
  hasMore: boolean;
  firstUnreadMessageId?: string | null;
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
  data: Pick<CachedConversationMessages, "messages" | "callEvents" | "hasMore" | "firstUnreadMessageId">,
): void {
  touch(conversationId, {
    messages: data.messages,
    callEvents: data.callEvents ?? [],
    hasMore: data.hasMore,
    firstUnreadMessageId: data.firstUnreadMessageId ?? null,
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
