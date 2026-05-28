"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  onOpenChange?: (open: boolean) => void;
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

function measurePortalListPosition(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  return {
    left: rect.left,
    width: rect.width,
    bottom: window.innerHeight - rect.top + 4,
  };
}

export function ThemePicker({
  theme,
  chaosUnlocked,
  onPick,
  placement = "default",
  onOpenChange,
}: Props) {
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

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  useLayoutEffect(() => {
    if (!open || !usePortal) {
      setListPosition(null);
      return;
    }

    function updatePosition() {
      const trigger = rootRef.current?.querySelector<HTMLButtonElement>(".user-menu-theme-trigger");
      if (!trigger) return;
      setListPosition(measurePortalListPosition(trigger));
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [open, usePortal]);

  const activeLabel =
    theme === CHAOS_THEME ? THEME_LABELS[CHAOS_THEME] : THEME_LABELS[theme as PickerTheme];

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerOutside(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    // Defer so the opening tap does not hit the listener in the same turn.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerOutside);
    }, 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selectTheme = useCallback(
    async (next: UserTheme) => {
      setOpen(false);
      await onPick(next);
    },
    [onPick],
  );

  function onOptionActivate(event: ReactPointerEvent | React.MouseEvent, next: UserTheme) {
    event.stopPropagation();
    void selectTheme(next);
  }

  const showList = open && (!usePortal || listPosition);
  const themeList = showList ? (
    <ul
      ref={listRef}
      id={listboxId}
      className={`user-menu-theme-list${usePortal ? " user-menu-theme-list--portal" : ""}`}
      role="listbox"
      aria-label="Theme"
      onPointerDown={(event) => event.stopPropagation()}
      style={
        usePortal && listPosition
          ? {
              position: "fixed",
              left: listPosition.left,
              width: listPosition.width,
              bottom: listPosition.bottom,
              top: "auto",
              right: "auto",
              zIndex: 10050,
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
            onClick={(event) => onOptionActivate(event, id)}
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
            onClick={(event) => onOptionActivate(event, CHAOS_THEME)}
          >
            <ChaosSwatch />
            <span className="user-menu-theme-option-label">{THEME_LABELS[CHAOS_THEME]}</span>
          </button>
        </li>
      )}
    </ul>
  ) : null;

  return (
    <div className="user-menu-theme-picker" ref={rootRef} data-user-menu-theme-picker-root>
      <button
        type="button"
        className="user-menu-theme-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          toggleOpen();
        }}
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
