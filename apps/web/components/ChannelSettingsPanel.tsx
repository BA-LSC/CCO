"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  children: ReactNode;
};

/** Matches channel-settings-panel slide animation in globals.css */
export const CHANNEL_SETTINGS_PANEL_ANIM_MS = 240;

export function ChannelSettingsPanel({ open, children }: Props) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mounted) return;
    setExiting(true);
  }, [mounted, open]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, CHANNEL_SETTINGS_PANEL_ANIM_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  if (!mounted) return null;

  return (
    <div
      className={[
        "chat-panel-details channel-settings-panel",
        exiting ? "channel-settings-panel--exit" : "channel-settings-panel--enter",
      ].join(" ")}
    >
      <div className="channel-settings-body">{children}</div>
    </div>
  );
}

type MuteSettingProps = {
  label?: string;
  muted: boolean;
  onChange: (muted: boolean) => void | Promise<void>;
};

const MUTE_CHAT_LABEL = "Mute chat";

export function ConversationMuteToggle({
  label = MUTE_CHAT_LABEL,
  muted,
  onChange,
}: MuteSettingProps) {
  return (
    <label className="channel-settings-row channel-settings-toggle">
      <span className="channel-settings-row-label">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={muted}
        onChange={(e) => void onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="toggle-switch" aria-hidden="true" />
    </label>
  );
}

export function ConversationMuteSetting({
  label = MUTE_CHAT_LABEL,
  muted,
  onChange,
}: MuteSettingProps) {
  return (
    <section className="channel-settings-group" aria-label="Notifications">
      <h3 className="channel-settings-group-label">Notifications</h3>
      <div className="channel-settings-card">
        <ConversationMuteToggle label={label} muted={muted} onChange={onChange} />
      </div>
    </section>
  );
}
