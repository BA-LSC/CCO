"use client";

import { useEffect, useId, useRef, useState } from "react";
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

export function ThemePicker({ theme, chaosUnlocked, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const activeLabel =
    theme === CHAOS_THEME ? THEME_LABELS[CHAOS_THEME] : THEME_LABELS[theme as PickerTheme];

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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

  async function select(next: UserTheme) {
    setOpen(false);
    await onPick(next);
  }

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

      {open && (
        <ul id={listboxId} className="user-menu-theme-list" role="listbox" aria-label="Theme">
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
      )}
    </div>
  );
}
