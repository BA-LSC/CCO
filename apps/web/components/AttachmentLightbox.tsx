"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AttachmentImage } from "@/components/AttachmentImage";
import { downloadAttachment } from "@/lib/download-attachment";
import { useAnimatedDismiss } from "@/hooks/useAnimatedDismiss";

export type AttachmentLightboxImage = {
  src: string;
  alt: string;
};

type Props = AttachmentLightboxImage & {
  onClose: () => void;
};

type Transform = {
  scale: number;
  x: number;
  y: number;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function stageFocalPoint(stage: HTMLElement, clientX: number, clientY: number) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clientX - rect.left - rect.width / 2,
    y: clientY - rect.top - rect.height / 2,
  };
}

/** Keep the image point under (focalX, focalY) fixed while changing scale. */
function zoomAtFocal(
  current: Transform,
  focalX: number,
  focalY: number,
  nextScale: number,
): Transform {
  const scale = clampScale(nextScale);
  if (scale <= 1) return { scale: 1, x: 0, y: 0 };

  const px = (focalX - current.x) / current.scale;
  const py = (focalY - current.y) / current.scale;

  return {
    scale,
    x: focalX - px * scale,
    y: focalY - py * scale,
  };
}

export function AttachmentLightbox({ src, alt, onClose }: Props) {
  const { exiting, requestClose } = useAnimatedDismiss(onClose);
  const stageRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const gestureRef = useRef<
    | {
        type: "pinch";
        startDist: number;
        startScale: number;
        startX: number;
        startY: number;
      }
    | { type: "pan"; startX: number; startY: number; startTx: number; startTy: number }
    | null
  >(null);
  const lastTapRef = useRef(0);
  const movedRef = useRef(false);

  const applyTransform = useCallback((next: Transform) => {
    const scale = clampScale(next.scale);
    const value: Transform = {
      scale,
      x: scale <= 1 ? 0 : next.x,
      y: scale <= 1 ? 0 : next.y,
    };
    transformRef.current = value;
    setTransform(value);
  }, []);

  const toggleZoom = useCallback(() => {
    if (transformRef.current.scale > 1) {
      applyTransform({ scale: 1, x: 0, y: 0 });
      return;
    }
    applyTransform({ scale: 2.5, x: 0, y: 0 });
  }, [applyTransform]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [requestClose]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onTouchStart = (event: TouchEvent) => {
      movedRef.current = false;
      if (event.touches.length === 2) {
        gestureRef.current = {
          type: "pinch",
          startDist: touchDistance(event.touches[0]!, event.touches[1]!),
          startScale: transformRef.current.scale,
          startX: transformRef.current.x,
          startY: transformRef.current.y,
        };
        return;
      }

      if (event.touches.length === 1 && transformRef.current.scale > 1) {
        gestureRef.current = {
          type: "pan",
          startX: event.touches[0]!.clientX,
          startY: event.touches[0]!.clientY,
          startTx: transformRef.current.x,
          startTy: transformRef.current.y,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) return;

      movedRef.current = true;
      event.preventDefault();

      if (gesture.type === "pinch" && event.touches.length >= 2) {
        const first = event.touches[0]!;
        const second = event.touches[1]!;
        const dist = touchDistance(first, second);
        const focal = stageFocalPoint(stage, (first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
        const nextScale = gesture.startScale * (dist / gesture.startDist);
        applyTransform(
          zoomAtFocal(
            { scale: gesture.startScale, x: gesture.startX, y: gesture.startY },
            focal.x,
            focal.y,
            nextScale,
          ),
        );
        return;
      }

      if (gesture.type === "pan" && event.touches.length === 1) {
        const touch = event.touches[0]!;
        applyTransform({
          scale: transformRef.current.scale,
          x: gesture.startTx + (touch.clientX - gesture.startX),
          y: gesture.startTy + (touch.clientY - gesture.startY),
        });
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;

      if (gesture?.type === "pinch" || movedRef.current) {
        if (transformRef.current.scale <= 1.05) {
          applyTransform({ scale: 1, x: 0, y: 0 });
        }
        return;
      }

      const now = Date.now();
      if (now - lastTapRef.current < 300 && event.changedTouches.length === 1) {
        toggleZoom();
        lastTapRef.current = 0;
        return;
      }

      lastTapRef.current = now;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.92 : 1.08;
      const focal = stageFocalPoint(stage, event.clientX, event.clientY);
      applyTransform(
        zoomAtFocal(transformRef.current, focal.x, focal.y, transformRef.current.scale * delta),
      );
    };

    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd, { passive: true });
    stage.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("wheel", onWheel);
    };
  }, [applyTransform, toggleZoom]);

  return (
    <div
      className={["attachment-lightbox", exiting ? "attachment-lightbox--exit" : ""]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="attachment-lightbox-toolbar">
        <button
          type="button"
          className="attachment-lightbox-action"
          onClick={() => void handleDownload()}
          disabled={downloading}
          aria-label={downloading ? "Downloading image" : "Download image"}
        >
          <svg
            className="attachment-lightbox-action-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
              fill="currentColor"
            />
          </svg>
          <span className="attachment-lightbox-action-label">
            {downloading ? "Saving…" : "Download"}
          </span>
        </button>
        <button type="button" className="attachment-lightbox-action" onClick={requestClose} aria-label="Close">
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
      {downloadError ? (
        <p className="attachment-lightbox-error" role="status">
          {downloadError}
        </p>
      ) : null}
      <div
        ref={stageRef}
        className="attachment-lightbox-stage"
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <AttachmentImage
          src={src}
          alt={alt}
          className="attachment-lightbox-image"
          style={
            exiting
              ? undefined
              : {
                  transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
                }
          }
          draggable={false}
          onDoubleClick={toggleZoom}
        />
      </div>
    </div>
  );
}
