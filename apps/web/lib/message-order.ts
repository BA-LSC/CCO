import type { Message } from "@/lib/api";

export function compareMessagesByCreatedAt(a: Message, b: Message): number {
  const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

/** Chronological order (oldest first) for the message list. */
export function sortMessagesByCreatedAt(messages: Message[]): Message[] {
  if (messages.length < 2) return messages;
  return [...messages].sort(compareMessagesByCreatedAt);
}
