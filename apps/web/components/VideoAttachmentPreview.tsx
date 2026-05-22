"use client";

import { useEffect, useState } from "react";
import { getVideoThumbnailUrl } from "@/lib/video-thumbnail-cache";

type Props = {
  label: string;
  src: string;
  onPlay: () => void;
};

export function VideoAttachmentPreview({ label, src, onPlay }: Props) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPosterUrl(null);

    void getVideoThumbnailUrl(src).then((url) => {
      if (!cancelled) setPosterUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <button
      type="button"
      className="attachment-open attachment-video-preview"
      aria-label={`Play ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onPlay();
      }}
    >
      <span className="attachment attachment-video-preview-frame" aria-hidden="true">
        {posterUrl ? (
          <img
            className="attachment-video-preview-video attachment-video-preview-video--ready"
            src={posterUrl}
            alt=""
            draggable={false}
          />
        ) : null}
        <span className="attachment-video-preview-scrim" aria-hidden="true" />
        <span className="attachment-video-preview-play">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M9 7.5v9l8.25-4.5L9 7.5Z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </button>
  );
}
