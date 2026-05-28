"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  giphyEnabled?: boolean;
  onPickMedia: () => void;
  onPickGiphy?: () => void;
};

const ATTACH_MENU_ANIM_MS = 200;

export function ComposerAttachMenu({ disabled, giphyEnabled, onPickMedia, onPickGiphy }: Props) {
  const [open, setOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const showGiphy = Boolean(giphyEnabled && onPickGiphy);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuVisible(false);
  }, []);

  const openMenu = useCallback(() => {
    setOpen(true);
    setMenuMounted(true);
  }, []);

  useEffect(() => {
    if (!menuMounted || !open) {
      if (!menuMounted) setMenuVisible(false);
      return;
    }

    const frame = requestAnimationFrame(() => setMenuVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [menuMounted, open]);

  useEffect(() => {
    if (open || !menuMounted) return;

    const timer = window.setTimeout(() => setMenuMounted(false), ATTACH_MENU_ANIM_MS);
    return () => clearTimeout(timer);
  }, [open, menuMounted]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenu, open]);

  return (
    <div className="composer-attach" ref={menuRef}>
      <button
        type="button"
        className="composer-attach-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        aria-label="Add attachment"
        onClick={() => (open ? closeMenu() : openMenu())}
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

      {menuMounted && (
        <div
          className={`composer-attach-menu${menuVisible ? " composer-attach-menu--open" : ""}`}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="composer-attach-menu-item"
            onClick={() => {
              closeMenu();
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
                closeMenu();
                onPickGiphy?.();
              }}
            >
              Giphy
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
