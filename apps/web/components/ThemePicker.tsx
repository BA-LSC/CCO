"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CHAOS_THEME,
  PICKER_THEMES,
  THEME_LABELS,
  THEME_SWATCHES,
  type PickerTheme,
  type UserTheme,
} from "@/lib/themes";

type Props = {
  theme: UserTheme;
  chaosUnlocked: boolean;
  onPick: (theme: UserTheme) => void | Promise<void>;
  /** Sidebar user menu: portal list so it is not clipped by the dropdown scroll container. */
  placement?: "default" | "sidebar";
};

function ThemeSwatch({ id }: { id: PickerTheme }) {
  const colors = THEME_SWATCHES[id];
  return (
    <span
      className="user-menu-theme-swatch"
      aria-hidden
      style={{
        background: `linear-gradient(135deg, ${colors.primary}, ${colors.primaryHover})`,
      }}
    />
  );
}

function ChaosSwatch() {
  return <span className="user-menu-theme-swatch user-menu-theme-swatch-chaos" aria-hidden />;
}

export function ThemePicker({ theme, chaosUnlocked, onPick, placement = "default" }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [listPosition, setListPosition] = useState<{
    left: number;
    width: number;
    bottom: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const usePortal = placement === "sidebar";

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !usePortal) {
      setListPosition(null);
      return;
    }

    function updatePosition() {
      const trigger = rootRef.current?.querySelector<HTMLButtonElement>(".user-menu-theme-trigger");
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setListPosition({
        left: rect.left,
        width: rect.width,
        bottom: window.innerHeight - rect.top + 4,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, usePortal]);

  const activeLabel =
    theme === CHAOS_THEME ? THEME_LABELS[CHAOS_THEME] : THEME_LABELS[theme as PickerTheme];

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
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

  async function select(next: UserTheme) {
    setOpen(false);
    await onPick(next);
  }

  const themeList =
    open ? (
      <ul
        ref={listRef}
        id={listboxId}
        className={`user-menu-theme-list${usePortal ? " user-menu-theme-list--portal" : ""}`}
        role="listbox"
        aria-label="Theme"
        style={
          usePortal && listPosition
            ? {
                position: "fixed",
                left: listPosition.left,
                width: listPosition.width,
                bottom: listPosition.bottom,
                top: "auto",
                right: "auto",
              }
            : undefined
        }
      >
        {PICKER_THEMES.map((id) => (
          <li key={id} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={theme === id}
              className={`user-menu-theme-option${theme === id ? " user-menu-theme-option-active" : ""}`}
              onClick={() => void select(id)}
            >
              <ThemeSwatch id={id} />
              <span className="user-menu-theme-option-label">{THEME_LABELS[id]}</span>
            </button>
          </li>
        ))}
        {chaosUnlocked && (
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={theme === CHAOS_THEME}
              className={`user-menu-theme-option user-menu-theme-option-chaos${
                theme === CHAOS_THEME ? " user-menu-theme-option-active" : ""
              }`}
              onClick={() => void select(CHAOS_THEME)}
            >
              <ChaosSwatch />
              <span className="user-menu-theme-option-label">{THEME_LABELS[CHAOS_THEME]}</span>
            </button>
          </li>
        )}
      </ul>
    ) : null;

  return (
    <div className="user-menu-theme-picker" ref={rootRef}>
      <button
        type="button"
        className="user-menu-theme-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((prev) => !prev)}
      >
        {theme === CHAOS_THEME ? <ChaosSwatch /> : <ThemeSwatch id={theme as PickerTheme} />}
        <span className="user-menu-theme-trigger-label">{activeLabel}</span>
        <svg className="user-menu-theme-trigger-chevron" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {usePortal && mounted && themeList
        ? createPortal(themeList, document.body)
        : themeList}
    </div>
  );
}
