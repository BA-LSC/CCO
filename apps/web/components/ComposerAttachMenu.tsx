"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  giphyEnabled?: boolean;
  onPickMedia: () => void;
  onPickGiphy?: () => void;
};

export function ComposerAttachMenu({ disabled, giphyEnabled, onPickMedia, onPickGiphy }: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const showGiphy = Boolean(giphyEnabled && onPickGiphy);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="composer-attach" ref={menuRef}>
      <button
        type="button"
        className="composer-attach-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        aria-label="Add attachment"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="composer-attach-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="composer-attach-menu-item"
            onClick={() => {
              setOpen(false);
              onPickMedia();
            }}
          >
            Media
          </button>
          {showGiphy ? (
            <button
              type="button"
              role="menuitem"
              className="composer-attach-menu-item"
              onClick={() => {
                setOpen(false);
                onPickGiphy?.();
              }}
            >
              Giphy search
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
