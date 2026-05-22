import type { Message } from "@/lib/api";

export function compareMessagesByCreatedAt(a: Message, b: Message): number {
  const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (diff !== 0) return diff;
  return a.id.localeCompare(b.id);
}

/** Keep the first occurrence when the same message id appears more than once. */
export function dedupeMessagesById(messages: Message[]): Message[] {
  const seen = new Set<string>();
  const deduped: Message[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    deduped.push(message);
  }
  return deduped;
}

/** Chronological order (oldest first) for the message list. */
export function sortMessagesByCreatedAt(messages: Message[]): Message[] {
  const deduped = dedupeMessagesById(messages);
  if (deduped.length < 2) return deduped;
  return deduped.sort(compareMessagesByCreatedAt);
}
