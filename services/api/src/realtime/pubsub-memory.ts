import type { RealtimeEvent } from "./events";

type Listener = (event: RealtimeEvent) => void;

const roomListeners = new Map<string, Set<Listener>>();

export function subscribeToConversationMemory(
  conversationId: string,
  listener: Listener,
): () => void {
  const key = roomKey(conversationId);
  if (!roomListeners.has(key)) roomListeners.set(key, new Set());
  roomListeners.get(key)!.add(listener);
  return () => {
    roomListeners.get(key)?.delete(listener);
  };
}

export function publishMessageEventMemory(event: RealtimeEvent): void {
  const listeners = roomListeners.get(roomKey(event.conversationId));
  if (!listeners) return;
  for (const listener of listeners) {
    listener(event);
  }
}

export function resetPubSubMemoryForTests(): void {
  roomListeners.clear();
}

function roomKey(conversationId: string): string {
  return `conversation:${conversationId}`;
}
