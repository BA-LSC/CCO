"use client";

import type { ComposerMediaKind } from "@/lib/composer-media";

type Props = {
  previewUrl: string;
  kind: ComposerMediaKind;
  fileName: string;
  onRemove: () => void;
};

export function ComposerPendingMedia({ previewUrl, kind, fileName, onRemove }: Props) {
  return (
    <div className="composer-pending-media">
      <div className="composer-pending-media-preview">
        {kind === "image" ? (
          <img
            src={previewUrl}
            alt=""
            className="composer-pending-media-thumb"
            draggable={false}
          />
        ) : (
          <>
            <video
              src={previewUrl}
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
      </div>
      <div className="composer-pending-media-meta">
        <span className="composer-pending-media-name">{fileName}</span>
        <span className="composer-pending-media-hint">Add a message or send</span>
      </div>
      <button
        type="button"
        className="composer-pending-media-remove"
        onClick={onRemove}
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
