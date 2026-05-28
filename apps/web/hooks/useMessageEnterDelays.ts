"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Message } from "@/lib/api";

const STAGGER_MS = 40;
const STAGGER_CAP = 12;

function staggerDelayFromBottom(fromBottom: number): number {
  return Math.min(fromBottom, STAGGER_CAP) * STAGGER_MS;
}

function isPendingPlaceholderId(id: string): boolean {
  return id.startsWith("pending-send:") || id.startsWith("pending-upload:");
}

function isOptimisticSwap(prevIds: readonly string[], currentIds: readonly string[]): boolean {
  const removed = prevIds.filter((id) => !currentIds.includes(id));
  const added = currentIds.filter((id) => !prevIds.includes(id));
  return (
    removed.length > 0 &&
    removed.length === added.length &&
    removed.every(isPendingPlaceholderId) &&
    added.every((id) => !isPendingPlaceholderId(id))
  );
}

function isPrepend(prevIds: readonly string[], currentIds: readonly string[]): boolean {
  const addedCount = currentIds.length - prevIds.length;
  if (addedCount <= 0 || prevIds.length === 0) return false;
  const prevTail = prevIds.at(-1);
  const currTail = currentIds.at(-1);
  if (prevTail !== currTail) return false;
  return currentIds.slice(addedCount).every((id, index) => id === prevIds[index]);
}

export function useMessageEnterDelays(
  messages: Message[],
  scrollReady: boolean,
  conversationId: string | null,
): ReadonlyMap<string, number> {
  const animatedIdsRef = useRef(new Set<string>());
  const initialEnterDoneRef = useRef(false);
  const prevMessageIdsRef = useRef<string[]>([]);
  const prevConversationIdRef = useRef(conversationId);
  const [delays, setDelays] = useState<ReadonlyMap<string, number>>(() => new Map());

  useEffect(() => {
    if (prevConversationIdRef.current === conversationId) return;
    prevConversationIdRef.current = conversationId;
    animatedIdsRef.current.clear();
    initialEnterDoneRef.current = false;
    prevMessageIdsRef.current = [];
    setDelays(new Map());
  }, [conversationId]);

  useLayoutEffect(() => {
    if (!scrollReady || messages.length === 0) return;

    const currentIds = messages.map((message) => message.id);
    const prevIds = prevMessageIdsRef.current;
    const nextDelays = new Map<string, number>();

    if (!initialEnterDoneRef.current) {
      initialEnterDoneRef.current = true;
      const count = messages.length;
      for (let index = 0; index < count; index++) {
        const message = messages[index]!;
        nextDelays.set(message.id, staggerDelayFromBottom(count - 1 - index));
      }
    } else if (prevIds.length > 0) {
      if (isPrepend(prevIds, currentIds)) {
        const addedCount = currentIds.length - prevIds.length;
        for (let index = 0; index < addedCount; index++) {
          animatedIdsRef.current.add(currentIds[index]!);
        }
      } else if (isOptimisticSwap(prevIds, currentIds)) {
        for (const id of currentIds) {
          if (!prevIds.includes(id)) {
            animatedIdsRef.current.add(id);
          }
        }
      } else {
        const newMessages = messages.filter(
          (message) => !prevIds.includes(message.id) && !animatedIdsRef.current.has(message.id),
        );
        if (newMessages.length > 0) {
          const batchSize = newMessages.length;
          newMessages.forEach((message, batchIndex) => {
            nextDelays.set(message.id, staggerDelayFromBottom(batchSize - 1 - batchIndex));
          });
        }
      }
    }

    if (nextDelays.size > 0) {
      for (const id of nextDelays.keys()) {
        animatedIdsRef.current.add(id);
      }
      setDelays(nextDelays);
    }

    prevMessageIdsRef.current = currentIds;
  }, [messages, scrollReady]);

  return delays;
}
