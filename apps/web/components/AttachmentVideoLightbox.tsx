"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadAttachment } from "@/lib/download-attachment";

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

const PLAYBACK_ERROR_MESSAGE =
  "This video could not play in your browser. Download it to watch locally, or try re-uploading as MP4 (H.264).";

export function AttachmentVideoLightbox({ src, alt, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      await downloadAttachment(src, alt);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [alt, downloading, src]);

  useEffect(() => {
    setPlaybackError(null);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    void video.play().catch(() => {});

    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="attachment-lightbox" role="dialog" aria-modal="true" aria-label="Video player">
      <div className="attachment-lightbox-toolbar">
        <button
          type="button"
          className="attachment-lightbox-action"
          onClick={() => void handleDownload()}
          disabled={downloading}
          aria-label={downloading ? "Downloading video" : "Download video"}
        >
          <svg
            className="attachment-lightbox-action-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor" />
          </svg>
          <span className="attachment-lightbox-action-label">
            {downloading ? "Saving…" : "Download"}
          </span>
        </button>
        <button type="button" className="attachment-lightbox-action" onClick={onClose} aria-label="Close">
          <svg
            className="attachment-lightbox-action-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"
              fill="currentColor"
            />
          </svg>
          <span className="attachment-lightbox-action-label">Close</span>
        </button>
      </div>
      {downloadError || playbackError ? (
        <p className="attachment-lightbox-error" role="status">
          {downloadError ?? playbackError}
        </p>
      ) : null}
      <div
        className="attachment-lightbox-stage attachment-lightbox-stage-video"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <video
          ref={videoRef}
          key={src}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="attachment-lightbox-video"
          aria-label={alt}
          onError={() => setPlaybackError(PLAYBACK_ERROR_MESSAGE)}
        />
      </div>
    </div>
  );
}
