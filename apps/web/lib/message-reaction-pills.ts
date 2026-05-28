import type { Reaction } from "@/lib/api";

export const REACTION_PILL_STAGGER_MS = 50;
export const REACTION_PILL_ANIMATION_MS = 180;

export type ReactionPillPhase = "steady" | "enter" | "exit";

export type ReactionPillRender = {
  emoji: string;
  list: Reaction[];
  phase: ReactionPillPhase;
  enterDelayMs: number;
};

export function groupReactionsByEmoji(reactions: Reaction[]): Array<[string, Reaction[]]> {
  const order: string[] = [];
  const map = new Map<string, Reaction[]>();
  for (const reaction of reactions) {
    let list = map.get(reaction.emoji);
    if (!list) {
      list = [];
      map.set(reaction.emoji, list);
      order.push(reaction.emoji);
    }
    list.push(reaction);
  }
  return order.map((emoji) => [emoji, map.get(emoji)!]);
}

export function reactionEmojiKeys(reactions: Reaction[]): string {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const reaction of reactions) {
    if (seen.has(reaction.emoji)) continue;
    seen.add(reaction.emoji);
    order.push(reaction.emoji);
  }
  return order.join("\0");
}

export function buildDisplayOrderFromGrouped(
  grouped: ReadonlyArray<[string, Reaction[]]>,
  reactionAlign: "own" | "other",
): string[] {
  const emojis = grouped.map(([emoji]) => emoji);
  return reactionAlign === "own" ? [...emojis].reverse() : [...emojis];
}

/** Append newly seen emoji types without reordering existing pills. */
export function appendNewEmojisToDisplayOrder(
  displayOrder: readonly string[],
  newEmojis: readonly string[],
  reactionAlign: "own" | "other",
): string[] {
  const order = [...displayOrder];
  for (const emoji of newEmojis) {
    if (order.includes(emoji)) continue;
    if (reactionAlign === "own") {
      order.unshift(emoji);
    } else {
      order.push(emoji);
    }
  }
  return order;
}

export function findAddedEmojiTypes(
  prevGrouped: ReadonlyArray<[string, Reaction[]]>,
  grouped: ReadonlyArray<[string, Reaction[]]>,
): string[] {
  const prev = new Set(prevGrouped.map(([emoji]) => emoji));
  return grouped.map(([emoji]) => emoji).filter((emoji) => !prev.has(emoji));
}

export function findRemovedEmojiGroups(
  prevGrouped: ReadonlyArray<[string, Reaction[]]>,
  grouped: ReadonlyArray<[string, Reaction[]]>,
): Array<[string, Reaction[]]> {
  const active = new Set(grouped.map(([emoji]) => emoji));
  return prevGrouped.filter(([emoji]) => !active.has(emoji));
}

export function buildEnterDelayByEmoji(
  enteringEmojis: ReadonlySet<string>,
  displayOrder: readonly string[],
  reactionAlign: "own" | "other",
): Map<string, number> {
  if (enteringEmojis.size === 0) return new Map();

  const staggerOrder: string[] = [];
  for (const emoji of displayOrder) {
    if (enteringEmojis.has(emoji)) staggerOrder.push(emoji);
  }
  for (const emoji of enteringEmojis) {
    if (!staggerOrder.includes(emoji)) staggerOrder.push(emoji);
  }

  const staggerSource = reactionAlign === "own" ? [...staggerOrder].reverse() : staggerOrder;
  return new Map(
    staggerSource.map((emoji, index) => [emoji, index * REACTION_PILL_STAGGER_MS]),
  );
}

export function buildReactionPillRenders(params: {
  grouped: ReadonlyArray<[string, Reaction[]]>;
  displayOrder: readonly string[];
  enteringEmojis: ReadonlySet<string>;
  exitingEmojis: ReadonlyArray<{ emoji: string; list: Reaction[] }>;
  enterDelayByEmoji: ReadonlyMap<string, number>;
}): ReactionPillRender[] {
  const { grouped, displayOrder, enteringEmojis, exitingEmojis, enterDelayByEmoji } = params;
  const byEmoji = new Map<string, { list: Reaction[]; phase: ReactionPillPhase }>();

  for (const [emoji, list] of grouped) {
    byEmoji.set(emoji, {
      list,
      phase: enteringEmojis.has(emoji) ? "enter" : "steady",
    });
  }

  for (const { emoji, list } of exitingEmojis) {
    if (!byEmoji.has(emoji)) {
      byEmoji.set(emoji, { list, phase: "exit" });
    }
  }

  const activeEmojis = new Set(grouped.map(([emoji]) => emoji));
  const order: string[] = [];

  for (const emoji of displayOrder) {
    const entry = byEmoji.get(emoji);
    if (entry != null && entry.phase !== "exit") {
      order.push(emoji);
    }
  }

  for (const emoji of activeEmojis) {
    if (!order.includes(emoji)) order.push(emoji);
  }

  for (const emoji of displayOrder) {
    const entry = byEmoji.get(emoji);
    if (entry?.phase === "exit" && !order.includes(emoji)) {
      const prevIndex = displayOrder.indexOf(emoji);
      let insertAt = order.length;
      for (let index = 0; index < order.length; index++) {
        const anchorIndex = displayOrder.indexOf(order[index]!);
        if (anchorIndex > prevIndex) {
          insertAt = index;
          break;
        }
      }
      order.splice(insertAt, 0, emoji);
    }
  }

  return order.map((emoji) => {
    const entry = byEmoji.get(emoji)!;
    return {
      emoji,
      list: entry.list,
      phase: entry.phase,
      enterDelayMs: enterDelayByEmoji.get(emoji) ?? 0,
    };
  });
}

export function maxEnterAnimationMs(enterDelayByEmoji: ReadonlyMap<string, number>): number {
  let maxDelay = 0;
  for (const delay of enterDelayByEmoji.values()) {
    if (delay > maxDelay) maxDelay = delay;
  }
  return REACTION_PILL_ANIMATION_MS + maxDelay;
}
