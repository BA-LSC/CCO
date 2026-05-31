import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Message } from "@/lib/api";
import {
  clearMessageCache,
  getCachedMessages,
  invalidateConversation,
  isMessageCacheFresh,
  MESSAGE_CACHE_MAX_AGE_MS,
  MESSAGE_CACHE_STORAGE_KEY,
  resetMessageCacheMemoryForTests,
  setCachedMessages,
  setMessageCacheUserId,
} from "./message-cache";

const sampleMessage = (id: string): Message => ({
  id,
  authorName: "Test User",
  body: `message ${id}`,
  attachmentUrl: null,
  messageType: "text",
  createdAt: "2026-01-01T00:00:00.000Z",
});

function installSessionStorageMock(): void {
  const store = new Map<string, string>();
  globalThis.sessionStorage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("message-cache", () => {
  beforeEach(() => {
    installSessionStorageMock();
    clearMessageCache();
    setMessageCacheUserId(null);
  });

  afterEach(() => {
    clearMessageCache();
    setMessageCacheUserId(null);
  });

  test("stores and retrieves messages in LRU order", () => {
    setMessageCacheUserId("user-1");
    setCachedMessages("conv-a", {
      messages: [sampleMessage("m1")],
      callEvents: [],
      hasMore: false,
    });
    setCachedMessages("conv-b", {
      messages: [sampleMessage("m2")],
      callEvents: [],
      hasMore: true,
    });

    expect(getCachedMessages("conv-a")?.messages[0]?.id).toBe("m1");
    expect(getCachedMessages("conv-b")?.hasMore).toBe(true);
  });

  test("invalidateConversation removes one entry", () => {
    setMessageCacheUserId("user-1");
    setCachedMessages("conv-a", {
      messages: [sampleMessage("m1")],
      callEvents: [],
      hasMore: false,
    });
    invalidateConversation("conv-a");
    expect(getCachedMessages("conv-a")).toBeNull();
  });

  test("isMessageCacheFresh respects max age", () => {
    const fresh = {
      messages: [],
      callEvents: [],
      hasMore: false,
      fetchedAt: Date.now(),
    };
    const stale = {
      ...fresh,
      fetchedAt: Date.now() - MESSAGE_CACHE_MAX_AGE_MS - 1,
    };
    expect(isMessageCacheFresh(fresh)).toBe(true);
    expect(isMessageCacheFresh(stale)).toBe(false);
  });

  test("persists to sessionStorage and hydrates for the same user", () => {
    setMessageCacheUserId("user-1");
    setCachedMessages("conv-a", {
      messages: [sampleMessage("m1")],
      callEvents: [],
      hasMore: false,
      peerLastReadAt: "2026-01-01T00:00:00.000Z",
      canPost: true,
    });

    expect(sessionStorage.getItem(MESSAGE_CACHE_STORAGE_KEY)).not.toBeNull();
    resetMessageCacheMemoryForTests();
    setMessageCacheUserId("user-1");

    const cached = getCachedMessages("conv-a");
    expect(cached?.messages[0]?.id).toBe("m1");
    expect(cached?.peerLastReadAt).toBe("2026-01-01T00:00:00.000Z");
    expect(cached?.canPost).toBe(true);
  });

  test("does not hydrate persisted cache for a different user", () => {
    setMessageCacheUserId("user-1");
    setCachedMessages("conv-a", {
      messages: [sampleMessage("m1")],
      callEvents: [],
      hasMore: false,
    });

    resetMessageCacheMemoryForTests();
    setMessageCacheUserId("user-2");

    expect(getCachedMessages("conv-a")).toBeNull();
    expect(sessionStorage.getItem(MESSAGE_CACHE_STORAGE_KEY)).toBeNull();
  });

  test("clearMessageCache removes persisted storage", () => {
    setMessageCacheUserId("user-1");
    setCachedMessages("conv-a", {
      messages: [sampleMessage("m1")],
      callEvents: [],
      hasMore: false,
    });
    clearMessageCache();
    expect(sessionStorage.getItem(MESSAGE_CACHE_STORAGE_KEY)).toBeNull();
  });
});
