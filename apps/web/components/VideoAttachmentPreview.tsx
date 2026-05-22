"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  label: string;
  src: string;
  onPlay: () => void;
};

export function VideoAttachmentPreview({ label, src, onPlay }: Props) {
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    setFrameReady(false);
  }, [src]);

  const primeFirstFrame = useCallback((video: HTMLVideoElement) => {
    const markReady = () => setFrameReady(true);

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markReady();
      return;
    }

    const onSeeked = () => {
      markReady();
      video.removeEventListener("seeked", onSeeked);
    };

    video.addEventListener("seeked", onSeeked);

    try {
      video.currentTime = 0.001;
    } catch {
      markReady();
    }
  }, []);

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
        <video
          className={`attachment-video-preview-video ${frameReady ? "attachment-video-preview-video--ready" : ""}`}
          src={src}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden="true"
          onLoadedMetadata={(event) => primeFirstFrame(event.currentTarget)}
          onLoadedData={(event) => primeFirstFrame(event.currentTarget)}
          onError={() => setFrameReady(false)}
        />
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
