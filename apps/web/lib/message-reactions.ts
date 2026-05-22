import type { Message, Reaction } from "@/lib/api";
import { dedupeMessagesById, sortMessagesByCreatedAt } from "@/lib/message-order";

function reactionKey(reaction: Reaction): string {
  return `${reaction.userId}:${reaction.emoji}`;
}

function reactionsEqual(a: Reaction[] | undefined, b: Reaction[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  const keys = new Set(left.map(reactionKey));
  return right.every((r) => keys.has(reactionKey(r)));
}

/** Apply a realtime or optimistic reaction add/remove to the message list. */
export function applyReactionChange(
  messages: Message[],
  messageId: string,
  reaction: Reaction,
  action: "added" | "removed" | undefined,
): Message[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message;

    const reactions = [...(message.reactions ?? [])];
    if (action === "removed") {
      return {
        ...message,
        reactions: reactions.filter(
          (r) => !(r.userId === reaction.userId && r.emoji === reaction.emoji),
        ),
      };
    }

    const exists = reactions.some(
      (r) => r.userId === reaction.userId && r.emoji === reaction.emoji,
    );
    if (!exists) reactions.push(reaction);
    return { ...message, reactions };
  });
}

export type MergeConversationMessagesOptions = {
  /** Locally deleted ids (realtime or optimistic) — always removed from the merged list. */
  excludeIds?: ReadonlySet<string>;
  /** Recently created ids still waiting to appear in poll snapshots. */
  recentIds?: ReadonlySet<string>;
};

function pollSnapshotBounds(polled: Message[]): { min: string; max: string } | null {
  if (polled.length === 0) return null;
  let min = polled[0].createdAt;
  let max = polled[0].createdAt;
  for (const message of polled) {
    if (message.createdAt < min) min = message.createdAt;
    if (message.createdAt > max) max = message.createdAt;
  }
  return { min, max };
}

function shouldDropMissingPolledMessage(
  message: Message,
  polledIds: ReadonlySet<string>,
  bounds: { min: string; max: string } | null,
  prevNewestCreatedAt: string | null,
  recentIds: ReadonlySet<string>,
): boolean {
  if (polledIds.has(message.id)) return false;
  if (recentIds.has(message.id)) return false;
  if (!bounds) return false;

  // Older than the poll window (e.g. loaded via "load more") — keep.
  if (message.createdAt < bounds.min) return false;

  // Missing from the poll snapshot inside its time window — deleted server-side.
  if (message.createdAt <= bounds.max) return true;

  // Newest message in the thread but gone from the server snapshot — deleted.
  if (prevNewestCreatedAt && message.createdAt === prevNewestCreatedAt) return true;

  return false;
}

/** Merge a polled message page into the current list (new messages + reaction/edit updates). */
export function mergeConversationMessages(
  prev: Message[],
  polled: Message[],
  options?: MergeConversationMessagesOptions,
): Message[] {
  const uniquePolled = dedupeMessagesById(polled);
  const excludeIds = options?.excludeIds;
  const recentIds = options?.recentIds ?? new Set<string>();
  const applyExclusions = (messages: Message[]) =>
    excludeIds?.size ? messages.filter((message) => !excludeIds.has(message.id)) : messages;

  if (prev.length === 0) return applyExclusions(sortMessagesByCreatedAt(uniquePolled));

  const polledById = new Map(uniquePolled.map((message) => [message.id, message]));
  const polledIds = new Set(uniquePolled.map((message) => message.id));
  const bounds = pollSnapshotBounds(uniquePolled);
  const prevNewestCreatedAt = prev.reduce<string | null>(
    (newest, message) =>
      newest === null || message.createdAt > newest ? message.createdAt : newest,
    null,
  );
  let changed = false;

  const merged = prev
    .filter((message) => {
      if (excludeIds?.has(message.id)) {
        changed = true;
        return false;
      }
      if (
        shouldDropMissingPolledMessage(message, polledIds, bounds, prevNewestCreatedAt, recentIds)
      ) {
        changed = true;
        return false;
      }
      return true;
    })
    .map((message) => {
      const fresh = polledById.get(message.id);
      if (!fresh) return message;

      const reactionsChanged = !reactionsEqual(message.reactions, fresh.reactions);
      const metaChanged = message.editedAt !== fresh.editedAt || message.body !== fresh.body;

      if (!reactionsChanged && !metaChanged) return message;

      changed = true;
      return {
        ...message,
        reactions: fresh.reactions,
        editedAt: fresh.editedAt,
        body: fresh.body,
      };
    });

  const ids = new Set(prev.map((message) => message.id));
  const newMessages = uniquePolled.filter((message) => !ids.has(message.id));
  if (newMessages.length > 0 || changed) {
    return applyExclusions(sortMessagesByCreatedAt([...merged, ...newMessages]));
  }

  return applyExclusions(dedupeMessagesById(prev));
}
