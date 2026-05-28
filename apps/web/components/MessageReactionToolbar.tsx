"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { buildEmojiPickerGroups } from "@/lib/emoji-picker-data";
import { QUICK_REACTION_EMOJIS, RECENT_EMOJI_GROUP_LABEL } from "@/lib/emoji-picker-constants";
import { getEmojiDisplayClass } from "@/lib/emoji-display";
import { pushRecentEmoji, readRecentEmojis } from "@/lib/emoji-recents";
import type { Reaction } from "@/lib/api";

export { QUICK_REACTION_EMOJIS } from "@/lib/emoji-picker-constants";

type EmojiToggleProps = {
  messageId: string;
  reactions?: Reaction[];
  currentUserId?: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
};

function getMyReactionEmojis(reactions: Reaction[], currentUserId?: string): Set<string> {
  if (!currentUserId) return new Set();
  return new Set(
    reactions.filter((reaction) => reaction.userId === currentUserId).map((reaction) => reaction.emoji),
  );
}

function getPickerWidth(viewportWidth: number): number {
  const maxWidth = viewportWidth >= 769 ? 420 : 360;
  return Math.min(maxWidth, viewportWidth - 16);
}

function computePickerStyle(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const width = getPickerWidth(window.innerWidth);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  const top = Math.max(8, rect.top - 8);

  return {
    position: "fixed",
    top,
    left,
    width,
    transform: "translateY(-100%)",
  };
}

function useEmojiPicker(messageId: string, onToggleReaction: (messageId: string, emoji: string) => void) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    setRecentEmojis(readRecentEmojis());
  }, [pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) return;

    let removeListeners = () => {};

    const id = window.setTimeout(() => {
      function onPointerDown(event: MouseEvent) {
        const target = event.target as Node;
        if (anchorRef.current?.contains(target)) return;
        if (popoverRef.current?.contains(target)) return;
        setPickerOpen(false);
      }

      function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") setPickerOpen(false);
      }

      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      removeListeners = () => {
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, 0);

    return () => {
      window.clearTimeout(id);
      removeListeners();
    };
  }, [pickerOpen]);

  function pickEmoji(emoji: string) {
    setRecentEmojis((current) => pushRecentEmoji(emoji, current));
    onToggleReaction(messageId, emoji);
  }

  return { pickerOpen, setPickerOpen, anchorRef, popoverRef, pickEmoji, recentEmojis };
}

function MessageEmojiPickerPopover({
  pickerOpen,
  pickEmoji,
  activeEmojis,
  recentEmojis,
  anchorRef,
  popoverRef,
}: {
  pickerOpen: boolean;
  pickEmoji: (emoji: string) => void;
  activeEmojis: Set<string>;
  recentEmojis: string[];
  anchorRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  const [style, setStyle] = useState<CSSProperties>({});
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredGroups = useMemo(
    () => buildEmojiPickerGroups(query, recentEmojis),
    [query, recentEmojis],
  );

  useEffect(() => {
    if (!pickerOpen) {
      setQuery("");
      return;
    }

    const focusTimer = window.setTimeout(() => {
      searchRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [pickerOpen]);

  useLayoutEffect(() => {
    if (!pickerOpen || !anchorRef.current) {
      setStyle({});
      return;
    }

    const updatePosition = () => {
      if (!anchorRef.current) return;
      setStyle(computePickerStyle(anchorRef.current));
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
    };
  }, [pickerOpen, anchorRef]);

  if (!pickerOpen || typeof document === "undefined" || !anchorRef.current) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="message-emoji-picker message-emoji-picker--floating"
      style={style}
      role="dialog"
      aria-label="Emoji picker"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="message-emoji-picker-header">
        <input
          ref={searchRef}
          type="search"
          className="message-emoji-picker-search"
          placeholder="Search emoji…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search emoji"
        />
      </div>
      <div className="message-emoji-picker-body">
        {filteredGroups.length === 0 ? (
          <p className="message-emoji-picker-empty">No emojis found</p>
        ) : (
          filteredGroups.map((group) => (
            <div
              key={group.label}
              className={`message-emoji-picker-group${group.label === RECENT_EMOJI_GROUP_LABEL ? " message-emoji-picker-group--recents" : ""}`}
            >
              <p className="message-emoji-picker-label">{group.label}</p>
              <div className="message-emoji-picker-grid">
                {group.emojis.map((emoji) => {
                  const active = activeEmojis.has(emoji);
                  return (
                    <button
                      key={`${group.label}-${emoji}`}
                      type="button"
                      className={`message-emoji-picker-item${active ? " message-emoji-picker-item--active" : ""}`}
                      aria-label={active ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                      aria-pressed={active}
                      onClick={() => pickEmoji(emoji)}
                    >
                      <span
                        className={getEmojiDisplayClass(emoji, "message-emoji-picker-emoji")}
                        aria-hidden
                      >
                        {emoji}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}

const LazyMessageEmojiPickerPopover = lazy(async () => ({
  default: MessageEmojiPickerPopover,
}));

function LazyEmojiPickerPopover(props: React.ComponentProps<typeof MessageEmojiPickerPopover>) {
  if (!props.pickerOpen) return null;
  return (
    <Suspense fallback={null}>
      <LazyMessageEmojiPickerPopover {...props} />
    </Suspense>
  );
}

export function MessageEmojiActions({
  messageId,
  reactions = [],
  currentUserId,
  onToggleReaction,
}: EmojiToggleProps) {
  const { pickerOpen, setPickerOpen, anchorRef, popoverRef, pickEmoji, recentEmojis } = useEmojiPicker(
    messageId,
    onToggleReaction,
  );
  const activeEmojis = getMyReactionEmojis(reactions, currentUserId);

  return (
    <>
      {QUICK_REACTION_EMOJIS.map((emoji) => {
        const active = activeEmojis.has(emoji);
        return (
        <button
          key={emoji}
          type="button"
          className={`message-action-emoji${active ? " message-action-emoji--active" : ""}`}
          aria-label={active ? `Remove ${emoji} reaction` : `React with ${emoji}`}
          aria-pressed={active}
          onClick={() => pickEmoji(emoji)}
        >
          {emoji}
        </button>
        );
      })}
      <div className="message-action-picker" ref={anchorRef}>
        <button
          type="button"
          className="message-action-emoji message-action-emoji-more"
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          aria-label="Choose emoji"
          onClick={() => setPickerOpen((open) => !open)}
        >
          +
        </button>
        <LazyEmojiPickerPopover
          pickerOpen={pickerOpen}
          pickEmoji={pickEmoji}
          activeEmojis={activeEmojis}
          recentEmojis={recentEmojis}
          anchorRef={anchorRef}
          popoverRef={popoverRef}
        />
      </div>
    </>
  );
}

export function MessageAddReactionButton({
  messageId,
  reactions = [],
  currentUserId,
  onToggleReaction,
}: EmojiToggleProps) {
  const { pickerOpen, setPickerOpen, anchorRef, popoverRef, pickEmoji, recentEmojis } = useEmojiPicker(
    messageId,
    onToggleReaction,
  );
  const activeEmojis = getMyReactionEmojis(reactions, currentUserId);

  return (
    <div className="message-action-picker message-reaction-add-picker" ref={anchorRef}>
      <button
        type="button"
        className="message-reaction-add"
        aria-expanded={pickerOpen}
        aria-haspopup="dialog"
        aria-label="Add reaction"
        onClick={() => setPickerOpen((open) => !open)}
      >
        +
      </button>
      <LazyEmojiPickerPopover
        pickerOpen={pickerOpen}
        pickEmoji={pickEmoji}
        activeEmojis={activeEmojis}
        recentEmojis={recentEmojis}
        anchorRef={anchorRef}
        popoverRef={popoverRef}
      />
    </div>
  );
}

type PillsProps = {
  messageId: string;
  reactions: Reaction[];
  currentUserId?: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  /** Own messages: + on the left, emojis grow toward the bubble. */
  reactionAlign?: "own" | "other";
  onExitingChange?: (exiting: boolean) => void;
};

const REACTION_PILL_STAGGER_MS = 50;
const REACTION_PILL_ANIMATION_MS = 180;

function groupReactionsByEmoji(reactions: Reaction[]): Array<[string, Reaction[]]> {
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

function reactionEmojiKeys(reactions: Reaction[]): string {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const reaction of reactions) {
    if (seen.has(reaction.emoji)) continue;
    seen.add(reaction.emoji);
    order.push(reaction.emoji);
  }
  return order.join("\0");
}

type ReactionPillRender = {
  emoji: string;
  list: Reaction[];
  phase: "steady" | "enter" | "exit";
  enterDelayMs: number;
};

export function MessageReactionPills({
  messageId,
  reactions,
  currentUserId,
  onToggleReaction,
  reactionAlign = "other",
  onExitingChange,
}: PillsProps) {
  const initializedRef = useRef(false);
  const seenEmojisRef = useRef(new Set<string>());
  const prevGroupedRef = useRef<Array<[string, Reaction[]]>>([]);
  const displayOrderRef = useRef<string[]>([]);
  const [exitingEmojis, setExitingEmojis] = useState<Array<{ emoji: string; list: Reaction[] }>>(
    [],
  );

  const grouped = useMemo(() => groupReactionsByEmoji(reactions), [reactions]);
  const emojiKeys = useMemo(() => reactionEmojiKeys(reactions), [reactions]);
  const orderedEmojis = useMemo(
    () =>
      reactionAlign === "own"
        ? [...grouped.map(([emoji]) => emoji)].reverse()
        : grouped.map(([emoji]) => emoji),
    [grouped, reactionAlign],
  );

  // Compare against prevGroupedRef during render (before layout effect commits) so exit
  // pills animate on the first frame. Must not be memoized — ref updates don't invalidate memo.
  const activeEmojiSet = new Set(grouped.map(([emoji]) => emoji));
  const removedSinceLastCommit = initializedRef.current
    ? prevGroupedRef.current.filter(([emoji]) => !activeEmojiSet.has(emoji))
    : ([] as Array<[string, Reaction[]]>);

  const activeExitingEmojis = (() => {
    const merged = new Map(exitingEmojis.map((entry) => [entry.emoji, entry]));
    for (const [emoji, list] of removedSinceLastCommit) {
      merged.set(emoji, { emoji, list });
    }
    return [...merged.values()];
  })();

  const hasActiveExitAnimation = activeExitingEmojis.length > 0;

  const enterDelayByEmoji = useMemo(() => {
    if (!initializedRef.current) return new Map<string, number>();
    const newlyAdded = grouped.filter(([emoji]) => !seenEmojisRef.current.has(emoji));
    const staggerSource = reactionAlign === "own" ? [...newlyAdded].reverse() : newlyAdded;
    return new Map(
      staggerSource.map(([emoji], index) => [emoji, index * REACTION_PILL_STAGGER_MS]),
    );
  }, [emojiKeys, grouped, reactionAlign]);

  useLayoutEffect(() => {
    const prevGrouped = prevGroupedRef.current;
    const currentEmojiSet = new Set(grouped.map(([emoji]) => emoji));
    let removed: Array<[string, Reaction[]]> = [];

    if (initializedRef.current) {
      removed = prevGrouped.filter(([emoji]) => !currentEmojiSet.has(emoji));
      if (removed.length > 0) {
        setExitingEmojis((current) => {
          const known = new Set(current.map((entry) => entry.emoji));
          const added = removed.filter(([emoji]) => !known.has(emoji));
          if (added.length === 0) return current;
          return [
            ...current,
            ...added.map(([emoji, list]) => ({
              emoji,
              list,
            })),
          ];
        });
      }
    } else {
      initializedRef.current = true;
    }

    grouped.forEach(([emoji]) => seenEmojisRef.current.add(emoji));
    prevGroupedRef.current = grouped;
    if (removed.length === 0) {
      displayOrderRef.current = orderedEmojis;
    }
  }, [emojiKeys, grouped, orderedEmojis, reactionAlign]);

  useLayoutEffect(() => {
    onExitingChange?.(hasActiveExitAnimation);
  }, [hasActiveExitAnimation, onExitingChange]);

  useEffect(() => {
    if (!hasActiveExitAnimation) return;
    const timeout = window.setTimeout(() => {
      setExitingEmojis((current) => {
        const activeEmojis = new Set(grouped.map(([emoji]) => emoji));
        for (const { emoji } of current) {
          if (!activeEmojis.has(emoji)) {
            seenEmojisRef.current.delete(emoji);
          }
        }
        return [];
      });
    }, REACTION_PILL_ANIMATION_MS);
    return () => window.clearTimeout(timeout);
  }, [grouped, hasActiveExitAnimation]);

  const pillRenders = (() => {
    const byEmoji = new Map<string, { list: Reaction[]; phase: ReactionPillRender["phase"] }>();

    for (const [emoji, list] of grouped) {
      const enterDelayMs = enterDelayByEmoji.get(emoji);
      byEmoji.set(emoji, {
        list,
        phase: enterDelayMs !== undefined ? "enter" : "steady",
      });
    }

    for (const { emoji, list } of activeExitingEmojis) {
      if (!byEmoji.has(emoji)) {
        byEmoji.set(emoji, { list, phase: "exit" });
      }
    }

    // Active pills use live order so new own-message reactions don't flash on the right
    // before useLayoutEffect updates displayOrderRef.
    const order = orderedEmojis.filter((emoji) => {
      const entry = byEmoji.get(emoji);
      return entry != null && entry.phase !== "exit";
    });

    for (const emoji of displayOrderRef.current) {
      const entry = byEmoji.get(emoji);
      if (entry?.phase === "exit" && !order.includes(emoji)) {
        const prevIndex = displayOrderRef.current.indexOf(emoji);
        let insertAt = order.length;
        for (let index = 0; index < order.length; index++) {
          const anchorIndex = displayOrderRef.current.indexOf(order[index]!);
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
      } satisfies ReactionPillRender;
    });
  })();

  if (pillRenders.length === 0) return null;

  const addButton = (
    <MessageAddReactionButton
      messageId={messageId}
      reactions={reactions}
      currentUserId={currentUserId}
      onToggleReaction={onToggleReaction}
    />
  );

  const emojiPills = pillRenders.map(({ emoji, list, phase, enterDelayMs }) => {
    const mine = list.some((reaction) => reaction.userId === currentUserId);
    const title = list.map((reaction) => reaction.userName).join(", ");
    const count = list.length;
    return (
      <button
        key={emoji}
        type="button"
        className={[
          "message-reaction-pill",
          mine ? "message-reaction-pill--mine" : "",
          phase === "enter" ? "message-reaction-pill--enter" : "",
          phase === "exit" ? "message-reaction-pill--exit" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          phase === "enter" && enterDelayMs > 0
            ? ({ ["--reaction-enter-delay" as string]: `${enterDelayMs}ms` } as CSSProperties)
            : undefined
        }
        title={title}
        aria-label={
          count > 1 ? `${emoji}, ${count} reactions, ${title}` : `${emoji}, ${title}`
        }
        onClick={() => onToggleReaction(messageId, emoji)}
        disabled={phase === "exit"}
      >
        <span className={getEmojiDisplayClass(emoji, "message-reaction-emoji")} aria-hidden>
          {emoji}
        </span>
        {count >= 2 && <span className="message-reaction-count">{count}</span>}
      </button>
    );
  });

  return (
    <div
      className={[
        "message-reaction-pills",
        reactionAlign === "own" ? "message-reaction-pills--own" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="group"
      aria-label="Reactions"
    >
      {reactionAlign === "own" ? (
        <>
          {addButton}
          {emojiPills}
        </>
      ) : (
        <>
          {emojiPills}
          {addButton}
        </>
      )}
    </div>
  );
}

type StackProps = {
  messageId: string;
  reactions: Reaction[];
  currentUserId?: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  reactionAlign?: "own" | "other";
  children: React.ReactNode;
};

export function MessageBubbleStack({
  messageId,
  reactions,
  currentUserId,
  onToggleReaction,
  reactionAlign = "other",
  children,
}: StackProps) {
  const [reactionsExiting, setReactionsExiting] = useState(false);
  const prevReactionCountRef = useRef(reactions.length);
  const hasReactions = reactions.length > 0;
  const showReactionRow =
    hasReactions ||
    reactionsExiting ||
    (prevReactionCountRef.current > 0 && reactions.length === 0);

  useLayoutEffect(() => {
    prevReactionCountRef.current = reactions.length;
  }, [reactions.length]);

  return (
    <div
      className={[
        "message-bubble-stack",
        showReactionRow ? "message-bubble-stack--has-reactions" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      {showReactionRow && (
        <div className="message-reaction-row">
          <MessageReactionPills
            messageId={messageId}
            reactions={reactions}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
            reactionAlign={reactionAlign}
            onExitingChange={setReactionsExiting}
          />
        </div>
      )}
    </div>
  );
}
