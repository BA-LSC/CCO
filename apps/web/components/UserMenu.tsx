"use client";

import { useEffect, useRef, useState } from "react";
import { PcoSignInButton } from "@/components/pco-sign-in-button";
import {
  USER_STATUS_LABELS,
  USER_STATUS_PRESETS,
  type UserStatusPreset,
} from "@cco/shared/user-status";
import { useTheme } from "@/components/ThemeProvider";
import { usePlanningCenterSync } from "@/components/PlanningCenterSyncContext";
import { UserAvatar } from "@/components/UserAvatar";
import { UserPresenceDot } from "@/components/UserPresenceDot";
import { resolvePresenceDotState, usePresence } from "@/components/PresenceProvider";
import { apiFetch } from "@/lib/api";
import {
  CHAOS_UNLOCK_CLICKS,
  CHAOS_UNLOCK_WINDOW_MS,
  THEME_LABELS,
  type UserTheme,
} from "@/lib/themes";

type SessionUser = {
  userId: string;
  displayName?: string;
  theme?: string;
  avatarUrl?: string | null;
  siteAdministrator?: boolean;
};

const PICKER_THEMES: UserTheme[] = ["1", "2", "3", "4", "5"];

type Props = {
  variant?: "default" | "sidebar";
};

export function UserMenu({ variant = "default" }: Props) {
  const { pageActive, myStatus, setMyStatus } = usePresence();
  const { theme, setTheme, chaosUnlocked, unlockChaos } = useTheme();
  const pcoSync = usePlanningCenterSync();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [chaosHint, setChaosHint] = useState(false);
  const [statusMessageDraft, setStatusMessageDraft] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const themeOneClicks = useRef<number[]>([]);

  useEffect(() => {
    apiFetch<SessionUser>("/api/v1/session/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

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

  useEffect(() => {
    if (!open) return;
    setStatusMessageDraft(myStatus.message ?? "");
  }, [myStatus.message, open]);

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

  const displayName = user.displayName?.trim() || "Signed in";

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

  async function handleStatusPreset(next: UserStatusPreset) {
    if (next === myStatus.preset) return;
    setStatusSaving(true);
    try {
      await setMyStatus({ preset: next });
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
  const presenceState = resolvePresenceDotState(myStatus.preset, pageActive);

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
        <span className="user-menu-name">{displayName}</span>
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
      </button>

      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-theme" role="group" aria-label="Theme">
            <span className="user-menu-dropdown-label">Theme</span>
            <div className="user-menu-theme-grid">
              {PICKER_THEMES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`user-menu-theme-btn user-menu-theme-btn-${id}${
                    theme === id ? " user-menu-theme-btn-active" : ""
                  }`}
                  aria-pressed={theme === id}
                  aria-label={`${THEME_LABELS[id]} theme`}
                  title={THEME_LABELS[id]}
                  onClick={() => void handleThemePick(id)}
                >
                  {id}
                </button>
              ))}
              {chaosUnlocked && (
                <button
                  type="button"
                  className={`user-menu-theme-btn user-menu-theme-btn-6${
                    theme === "6" ? " user-menu-theme-btn-active" : ""
                  }`}
                  aria-pressed={theme === "6"}
                  aria-label="CHAOS theme"
                  title="CHAOS"
                  onClick={() => void handleThemePick("6")}
                >
                  ☠
                </button>
              )}
            </div>
            {chaosHint && (
              <p className="user-menu-chaos-toast" role="status">
                CHAOS UNLEASHED
              </p>
            )}
          </div>

          <div className="user-menu-status" role="group" aria-label="Status">
            <span className="user-menu-dropdown-label">Status</span>
            <div className="user-menu-status-grid">
              {USER_STATUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`user-menu-status-btn user-menu-status-btn-${preset}${
                    myStatus.preset === preset ? " user-menu-status-btn-active" : ""
                  }`}
                  aria-pressed={myStatus.preset === preset}
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

          {pcoSync && (
            <div className="user-menu-sync" role="group" aria-label="Planning Center sync">
              <span className="user-menu-dropdown-label">Planning Center</span>
              <button
                type="button"
                className="user-menu-item"
                role="menuitem"
                disabled={pcoSync.groupsSyncing || pcoSync.teamsSyncing}
                onClick={() => void pcoSync.syncPco().then(() => setOpen(false))}
              >
                {pcoSync.groupsSyncing || pcoSync.teamsSyncing ? "Syncing PCO…" : "Sync PCO"}
              </button>
              {pcoSync.needsReconnect && (
                <a
                  href="/auth/reconnect"
                  className="user-menu-item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  Reconnect Planning Center
                </a>
              )}
            </div>
          )}
          {user.siteAdministrator && (
            <a
              href="/settings/integrations"
              className="user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Admin Settings
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
      )}
    </div>
  );
}
