"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComposerMediaKind } from "@/lib/composer-media";

const CARD_SIZE_PX = 72;
const CARD_GAP_PX = 8;
const LONG_PRESS_MS = 450;

export type ComposerPendingMediaItem = {
  id: string;
  previewUrl: string;
  kind: ComposerMediaKind;
};

type Props = {
  items: ComposerPendingMediaItem[];
  coarsePointer: boolean;
  onRemove: (id: string) => void;
};

function computeMaxVisibleSlots(containerWidth: number): number {
  if (containerWidth <= 0) return 1;
  return Math.max(1, Math.floor((containerWidth + CARD_GAP_PX) / (CARD_SIZE_PX + CARD_GAP_PX)));
}

type CardProps = {
  item: ComposerPendingMediaItem;
  coarsePointer: boolean;
  held: boolean;
  onHoldChange: (id: string | null) => void;
  onRemove: (id: string) => void;
};

function PendingMediaCard({ item, coarsePointer, held, onHoldChange, onRemove }: CardProps) {
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  return (
    <div
      className={[
        "composer-pending-media-card",
        coarsePointer && held ? "composer-pending-media-card--held" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onTouchStart={
        coarsePointer
          ? () => {
              clearLongPressTimer();
              longPressTimerRef.current = window.setTimeout(() => {
                onHoldChange(item.id);
              }, LONG_PRESS_MS);
            }
          : undefined
      }
      onTouchEnd={coarsePointer ? clearLongPressTimer : undefined}
      onTouchMove={coarsePointer ? clearLongPressTimer : undefined}
      onTouchCancel={coarsePointer ? clearLongPressTimer : undefined}
    >
      {item.kind === "image" ? (
        <img
          src={item.previewUrl}
          alt=""
          className="composer-pending-media-thumb"
          draggable={false}
        />
      ) : (
        <>
          <video
            src={item.previewUrl}
            muted
            playsInline
            preload="metadata"
            className="composer-pending-media-thumb"
            aria-hidden
          />
          <span className="composer-pending-media-video-badge" aria-hidden>
            Video
          </span>
        </>
      )}
      <button
        type="button"
        className="composer-pending-media-remove"
        onClick={() => {
          onHoldChange(null);
          onRemove(item.id);
        }}
        aria-label="Remove attachment"
      >
        <svg viewBox="0 0 24 24" aria-hidden focusable="false">
          <path
            d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  );
}

export function ComposerPendingMedia({ items, coarsePointer, onRemove }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [maxVisibleSlots, setMaxVisibleSlots] = useState(items.length);
  const [heldCardId, setHeldCardId] = useState<string | null>(null);

  useEffect(() => {
    setHeldCardId(null);
  }, [items]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const updateSlots = () => {
      setMaxVisibleSlots(computeMaxVisibleSlots(row.clientWidth));
    };

    updateSlots();

    const observer = new ResizeObserver(updateSlots);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  const hasOverflow = items.length > maxVisibleSlots;
  const visibleItems = hasOverflow ? items.slice(0, Math.max(1, maxVisibleSlots - 1)) : items;
  const overflowCount = hasOverflow ? items.length - visibleItems.length : 0;

  return (
    <div className="composer-pending-media">
      <div ref={rowRef} className="composer-pending-media-row">
        {visibleItems.map((item) => (
          <PendingMediaCard
            key={item.id}
            item={item}
            coarsePointer={coarsePointer}
            held={heldCardId === item.id}
            onHoldChange={setHeldCardId}
            onRemove={onRemove}
          />
        ))}
        {overflowCount > 0 ? (
          <div className="composer-pending-media-overflow" aria-hidden>
            +{overflowCount}
          </div>
        ) : null}
      </div>
    </div>
  );
}
