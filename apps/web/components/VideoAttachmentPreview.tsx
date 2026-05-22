"use client";

type Props = {
  label: string;
  onPlay: () => void;
};

export function VideoAttachmentPreview({ label, onPlay }: Props) {
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
        <span className="attachment-video-preview-play">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </span>
      </span>
    </button>
  );
}
