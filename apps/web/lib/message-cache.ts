import type { MemberReadReceipt, Message, PeerUser } from "@/lib/api";
import type { CallTimelineEventDto } from "@/lib/call-timeline";

export const MESSAGE_CACHE_STORAGE_KEY = "cco:message-cache";
/** Freshness threshold for optional cache consumers (e.g. UI hints). Loads always revalidate in background. */
export const MESSAGE_CACHE_MAX_AGE_MS = 30_000;

export type CachedConversationMessages = {
  messages: Message[];
  callEvents: CallTimelineEventDto[];
  hasMore: boolean;
  firstUnreadMessageId?: string | null;
  peerLastReadAt?: string | null;
  peerUser?: PeerUser | null;
  memberReadReceipts?: MemberReadReceipt[];
  canPost?: boolean | null;
  fetchedAt: number;
};

export type MessageCacheWriteInput = Pick<
  CachedConversationMessages,
  | "messages"
  | "callEvents"
  | "hasMore"
  | "firstUnreadMessageId"
  | "peerLastReadAt"
  | "peerUser"
  | "memberReadReceipts"
  | "canPost"
>;

const MAX_ENTRIES = 16;
const MAX_PERSIST_BYTES = 4 * 1024 * 1024;

/** LRU-ordered by last access (Map insertion order). */
const cache = new Map<string, CachedConversationMessages>();
let cacheUserId: string | null = null;

type PersistedMessageCache = {
  userId: string;
  entries: Array<[string, CachedConversationMessages]>;
};

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

export function isMessageCacheFresh(
  entry: CachedConversationMessages,
  maxAgeMs = MESSAGE_CACHE_MAX_AGE_MS,
): boolean {
  return Date.now() - entry.fetchedAt < maxAgeMs;
}

function canUseSessionStorage(): boolean {
  return typeof sessionStorage !== "undefined";
}

function readPersistedCache(): PersistedMessageCache | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(MESSAGE_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMessageCache;
    if (typeof parsed.userId !== "string" || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedCache(): void {
  if (!canUseSessionStorage() || !cacheUserId) return;
  try {
    const payload: PersistedMessageCache = {
      userId: cacheUserId,
      entries: [...cache.entries()],
    };
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_PERSIST_BYTES) return;
    sessionStorage.setItem(MESSAGE_CACHE_STORAGE_KEY, serialized);
  } catch {
    /* ignore quota / private mode */
  }
}

function clearPersistedCache(): void {
  if (!canUseSessionStorage()) return;
  try {
    sessionStorage.removeItem(MESSAGE_CACHE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function hydrateFromSessionStorage(userId: string): void {
  const persisted = readPersistedCache();
  if (!persisted || persisted.userId !== userId) {
    clearPersistedCache();
    return;
  }
  for (const [conversationId, entry] of persisted.entries) {
    if (
      entry &&
      typeof entry === "object" &&
      Array.isArray(entry.messages) &&
      typeof entry.fetchedAt === "number"
    ) {
      cache.set(conversationId, {
        messages: entry.messages,
        callEvents: entry.callEvents ?? [],
        hasMore: Boolean(entry.hasMore),
        firstUnreadMessageId: entry.firstUnreadMessageId ?? null,
        peerLastReadAt: entry.peerLastReadAt ?? null,
        peerUser: entry.peerUser ?? null,
        memberReadReceipts: entry.memberReadReceipts ?? [],
        canPost: entry.canPost ?? null,
        fetchedAt: entry.fetchedAt,
      });
    }
  }
}

/** Scope in-memory and persisted cache to the signed-in user; clears on sign-out or user switch. */
export function setMessageCacheUserId(userId: string | null): void {
  if (userId === cacheUserId) {
    if (userId && cache.size === 0) hydrateFromSessionStorage(userId);
    return;
  }
  cacheUserId = userId;
  cache.clear();
  if (!userId) {
    clearPersistedCache();
    return;
  }
  hydrateFromSessionStorage(userId);
}

export function getCachedMessages(conversationId: string): CachedConversationMessages | null {
  const entry = cache.get(conversationId);
  if (!entry) return null;
  touch(conversationId, entry);
  return entry;
}

export function setCachedMessages(conversationId: string, data: MessageCacheWriteInput): void {
  touch(conversationId, {
    messages: data.messages,
    callEvents: data.callEvents ?? [],
    hasMore: data.hasMore,
    firstUnreadMessageId: data.firstUnreadMessageId ?? null,
    peerLastReadAt: data.peerLastReadAt ?? null,
    peerUser: data.peerUser ?? null,
    memberReadReceipts: data.memberReadReceipts ?? [],
    canPost: data.canPost ?? null,
    fetchedAt: Date.now(),
  });
  evictIfNeeded();
  writePersistedCache();
}

export function invalidateConversation(conversationId: string): void {
  cache.delete(conversationId);
  writePersistedCache();
}

export function clearMessageCache(): void {
  cache.clear();
  clearPersistedCache();
}

/** Test-only: drop in-memory entries without clearing sessionStorage. */
export function resetMessageCacheMemoryForTests(): void {
  cache.clear();
}
