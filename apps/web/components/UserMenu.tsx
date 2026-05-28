"use client";

import { useEffect, useRef, useState } from "react";
import { PcoSignInButton } from "@/components/pco-sign-in-button";
import {
  USER_STATUS_LABELS,
  USER_STATUS_PICKER_PRESETS,
  normalizeUserStatusPreset,
  type UserStatusPickerPreset,
} from "@cco/shared/user-status";
import { useTheme } from "@/components/ThemeProvider";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { UserAvatar } from "@/components/UserAvatar";
import { UserPresenceDot } from "@/components/UserPresenceDot";
import { resolvePresenceDotState, usePresence } from "@/components/PresenceProvider";
import { apiFetch } from "@/lib/api";
import { ThemePicker } from "@/components/ThemePicker";
import { CHAOS_UNLOCK_CLICKS, CHAOS_UNLOCK_WINDOW_MS, type UserTheme } from "@/lib/themes";
import { useAdminUpdateAvailable } from "@/lib/use-admin-update-available";

type SessionUser = {
  userId: string;
  displayName?: string;
  theme?: string;
  avatarUrl?: string | null;
  siteAdministrator?: boolean;
};

type Props = {
  variant?: "default" | "sidebar";
};

function isPlaceholderDisplayName(name: string | null | undefined): boolean {
  const normalized = name
    ?.trim()
    .toLowerCase()
    .replace(/[''.`-]/g, "")
    .replace(/\s+/g, " ");
  return !normalized || normalized === "member" || normalized === "user";
}

function resolveDisplayName(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed || isPlaceholderDisplayName(trimmed)) continue;
    return trimmed;
  }
  return "Signed in";
}

export function UserMenu({ variant = "default" }: Props) {
  const { session: layoutSession } = useChatLayout();
  const { myStatus, setMyStatus, markUserActive, isUserOnline } = usePresence();
  const { theme, setTheme, chaosUnlocked, unlockChaos } = useTheme();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [chaosHint, setChaosHint] = useState(false);
  const [statusMessageDraft, setStatusMessageDraft] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const themePickerOpenRef = useRef(false);
  const themeOneClicks = useRef<number[]>([]);
  const adminUpdateAvailable = useAdminUpdateAvailable(
    !loading && Boolean(user?.siteAdministrator),
    { refreshWhen: open },
  );

  useEffect(() => {
    apiFetch<SessionUser>("/api/v1/session/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;

    function shouldKeepMenuOpen(target: Node) {
      if (themePickerOpenRef.current) return true;
      if (menuRef.current?.contains(target)) return true;
      if (!(target instanceof Element)) return false;
      return Boolean(
        target.closest(".user-menu-theme-list") ||
          target.closest("[data-user-menu-theme-picker-root]"),
      );
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (shouldKeepMenuOpen(target)) return;
      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStatusMessageDraft(myStatus.message ?? "");
  }, [myStatus.message, open]);

  useEffect(() => {
    if (open) return;
    themePickerOpenRef.current = false;
  }, [open]);

  if (loading) {
    return (
      <div className={`user-menu${variant === "sidebar" ? " user-menu-sidebar" : ""}`}>
        <div
          className={`user-menu-trigger user-menu-skeleton-trigger${
            variant === "sidebar" ? " user-menu-skeleton-trigger-sidebar" : ""
          }`}
          aria-hidden
        >
          <span className="sidebar-skeleton-avatar user-menu-skeleton-avatar" />
          <span className="sidebar-skeleton-label user-menu-skeleton-label" />
        </div>
        <span className="visually-hidden">Loading account</span>
      </div>
    );
  }

  if (!user?.userId) {
    if (variant === "sidebar") {
      return (
        <div className="user-menu user-menu-sidebar">
          <PcoSignInButton>Sign in</PcoSignInButton>
        </div>
      );
    }
    return <PcoSignInButton>Sign in</PcoSignInButton>;
  }

  const displayName = resolveDisplayName(user?.displayName, layoutSession?.displayName);

  async function handleThemePick(next: UserTheme) {
    if (next === "1") {
      const now = Date.now();
      themeOneClicks.current = themeOneClicks.current.filter(
        (t) => now - t < CHAOS_UNLOCK_WINDOW_MS,
      );
      themeOneClicks.current.push(now);

      if (!chaosUnlocked && themeOneClicks.current.length >= CHAOS_UNLOCK_CLICKS) {
        themeOneClicks.current = [];
        setChaosHint(true);
        await unlockChaos();
        return;
      }
    } else {
      themeOneClicks.current = [];
    }

    await setTheme(next);
  }

  async function handleStatusPreset(next: UserStatusPickerPreset) {
    markUserActive();

    if (next === "active") {
      if (myStatus.preset === "active" && !myStatus.message) return;

      setStatusSaving(true);
      try {
        await setMyStatus({ preset: "active", message: null });
      } finally {
        setStatusSaving(false);
      }
      return;
    }

    if (myStatus.preset === "offline") return;

    setStatusSaving(true);
    try {
      await setMyStatus({ preset: "offline" });
    } finally {
      setStatusSaving(false);
    }
  }

  async function saveStatusMessage() {
    const trimmed = statusMessageDraft.trim();
    const nextMessage = trimmed.length > 0 ? trimmed : null;
    if (nextMessage === (myStatus.message ?? null)) return;

    setStatusSaving(true);
    try {
      await setMyStatus({ message: nextMessage });
    } finally {
      setStatusSaving(false);
    }
  }

  const menuClass = variant === "sidebar" ? "user-menu user-menu-sidebar" : "user-menu";
  const selectedPreset = normalizeUserStatusPreset(myStatus.preset);
  const presenceState = resolvePresenceDotState(
    myStatus.preset,
    isUserOnline(user.userId),
  );
  const statusMessage = myStatus.message?.trim() ?? "";

  return (
    <div className={menuClass} ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="user-menu-avatar-wrap">
          <UserAvatar
            displayName={displayName}
            avatarUrl={user.avatarUrl}
            className="user-menu-avatar"
          />
          {variant === "sidebar" && (
            <UserPresenceDot
              state={presenceState}
              size="sm"
              title={myStatus.message}
            />
          )}
        </span>
        <span className={variant === "sidebar" ? "user-menu-identity" : "user-menu-name"}>
          {variant === "sidebar" ? (
            <>
              <span className="user-menu-name">{displayName}</span>
              {statusMessage ? (
                <span className="user-menu-status-preview">{statusMessage}</span>
              ) : null}
            </>
          ) : (
            displayName
          )}
        </span>
        <span className="user-menu-chevron-wrap">
          {adminUpdateAvailable ? (
            <span
              className="user-menu-update-dot"
              title="Update available"
              aria-label="Update available"
            />
          ) : null}
          <span className={`user-menu-chevron${open ? " user-menu-chevron-open" : ""}`} aria-hidden>
            <svg className="user-menu-chevron-icon" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M18 15l-6-6-6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </button>

      {open && (
        <div
          className={`user-menu-dropdown${
            variant === "sidebar" ? " user-menu-dropdown-sidebar" : ""
          }`}
          role="menu"
        >
          <div className="user-menu-dropdown-theme">
            <div className="user-menu-theme" role="group" aria-label="Theme">
              <span className="user-menu-dropdown-label">Theme</span>
              <ThemePicker
                theme={theme}
                chaosUnlocked={chaosUnlocked}
                placement={variant === "sidebar" ? "sidebar" : "default"}
                onOpenChange={(next) => {
                  themePickerOpenRef.current = next;
                }}
                onPick={(next) => handleThemePick(next)}
              />
              {chaosHint && (
                <p className="user-menu-chaos-toast" role="status">
                  <span className="user-menu-chaos-toast-text">🎉 CHAOS UNLEASHED 🎊</span>
                </p>
              )}
            </div>
          </div>

          <div className="user-menu-dropdown-scroll">
            <div className="user-menu-status" role="group" aria-label="Status">
              <span className="user-menu-dropdown-label">Status</span>
              <div className="user-menu-status-grid">
                {USER_STATUS_PICKER_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`user-menu-status-btn user-menu-status-btn-${preset}${
                      selectedPreset === preset ? " user-menu-status-btn-active" : ""
                    }`}
                    aria-pressed={selectedPreset === preset}
                    disabled={statusSaving}
                    onClick={() => void handleStatusPreset(preset)}
                  >
                    {USER_STATUS_LABELS[preset]}
                  </button>
                ))}
              </div>
              <label className="user-menu-status-message-field">
                <span className="visually-hidden">Status message</span>
                <input
                  type="text"
                  className="user-menu-status-message"
                  value={statusMessageDraft}
                  maxLength={80}
                  placeholder="What's going on?"
                  disabled={statusSaving}
                  onChange={(event) => setStatusMessageDraft(event.target.value)}
                  onBlur={() => void saveStatusMessage()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              </label>
            </div>

            {user.siteAdministrator && (
              <a
                href="/settings/admin"
                className="user-menu-item user-menu-item-admin"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span>Admin Settings</span>
                {adminUpdateAvailable ? (
                  <span className="user-menu-update-badge">Update available</span>
                ) : null}
              </a>
            )}
            <a
              href="/auth/sign-out?next=/"
              className="user-menu-item user-menu-item-danger"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Sign out
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
