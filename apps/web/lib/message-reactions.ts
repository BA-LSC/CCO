import type { Message, Reaction } from "@/lib/api";

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

/** Merge a polled message page into the current list (new messages + reaction/edit updates). */
export function mergeConversationMessages(prev: Message[], polled: Message[]): Message[] {
  if (prev.length === 0) return polled;

  const polledById = new Map(polled.map((message) => [message.id, message]));
  let changed = false;

  const merged = prev.map((message) => {
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
  const newMessages = polled.filter((message) => !ids.has(message.id));
  if (newMessages.length > 0) {
    return [...merged, ...newMessages];
  }

  return changed ? merged : prev;
}
