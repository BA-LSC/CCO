"use client";

import {
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
import { filterEmojiPickerGroups, QUICK_REACTION_EMOJIS } from "@/lib/emoji-picker-data";
import type { Reaction } from "@/lib/api";

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

function computePickerStyle(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(360, window.innerWidth - 16);
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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
    onToggleReaction(messageId, emoji);
  }

  return { pickerOpen, setPickerOpen, anchorRef, popoverRef, pickEmoji };
}

function MessageEmojiPickerPopover({
  pickerOpen,
  pickEmoji,
  activeEmojis,
  anchorRef,
  popoverRef,
}: {
  pickerOpen: boolean;
  pickEmoji: (emoji: string) => void;
  activeEmojis: Set<string>;
  anchorRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  const [style, setStyle] = useState<CSSProperties>({});
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredGroups = useMemo(() => filterEmojiPickerGroups(query), [query]);

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
            <div key={group.label} className="message-emoji-picker-group">
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
                      {emoji}
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

export function MessageEmojiActions({
  messageId,
  reactions = [],
  currentUserId,
  onToggleReaction,
}: EmojiToggleProps) {
  const { pickerOpen, setPickerOpen, anchorRef, popoverRef, pickEmoji } = useEmojiPicker(
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
        <MessageEmojiPickerPopover
          pickerOpen={pickerOpen}
          pickEmoji={pickEmoji}
          activeEmojis={activeEmojis}
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
  const { pickerOpen, setPickerOpen, anchorRef, popoverRef, pickEmoji } = useEmojiPicker(
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
      <MessageEmojiPickerPopover
        pickerOpen={pickerOpen}
        pickEmoji={pickEmoji}
        activeEmojis={activeEmojis}
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
};

export function MessageReactionPills({
  messageId,
  reactions,
  currentUserId,
  onToggleReaction,
}: PillsProps) {
  const grouped = Array.from(
    reactions.reduce((map, reaction) => {
      const list = map.get(reaction.emoji) ?? [];
      list.push(reaction);
      map.set(reaction.emoji, list);
      return map;
    }, new Map<string, Reaction[]>()),
  );

  if (grouped.length === 0) return null;

  return (
    <div className="message-reaction-pills" role="group" aria-label="Reactions">
      {grouped.map(([emoji, list]) => {
        const mine = list.some((reaction) => reaction.userId === currentUserId);
        const title = list.map((reaction) => reaction.userName).join(", ");
        const count = list.length;
        return (
          <button
            key={emoji}
            type="button"
            className={`message-reaction-pill${mine ? " message-reaction-pill--mine" : ""}`}
            title={title}
            aria-label={
              count > 1 ? `${emoji}, ${count} reactions, ${title}` : `${emoji}, ${title}`
            }
            onClick={() => onToggleReaction(messageId, emoji)}
          >
            <span className="message-reaction-emoji" aria-hidden>
              {emoji}
            </span>
            {count >= 2 && <span className="message-reaction-count">{count}</span>}
          </button>
        );
      })}
      <MessageAddReactionButton
        messageId={messageId}
        reactions={reactions}
        currentUserId={currentUserId}
        onToggleReaction={onToggleReaction}
      />
    </div>
  );
}

type StackProps = {
  messageId: string;
  reactions: Reaction[];
  currentUserId?: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  children: ReactNode;
};

export function MessageBubbleStack({
  messageId,
  reactions,
  currentUserId,
  onToggleReaction,
  children,
}: StackProps) {
  const hasReactions = reactions.length > 0;

  return (
    <div
      className={[
        "message-bubble-stack",
        hasReactions ? "message-bubble-stack--has-reactions" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
      {hasReactions && (
        <div className="message-reaction-row">
          <MessageReactionPills
            messageId={messageId}
            reactions={reactions}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
          />
        </div>
      )}
    </div>
  );
}
