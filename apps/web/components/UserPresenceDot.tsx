"use client";

import type { PresenceDotState } from "@cco/shared";

type Props = {
  state: PresenceDotState;
  size?: "xs" | "sm" | "md";
  title?: string | null;
};

const STATE_LABELS: Record<PresenceDotState, string> = {
  online: "Active now",
  offline: "Offline",
  away: "Away",
  busy: "Busy",
};

export function UserPresenceDot({ state, size = "md", title }: Props) {
  return (
    <span
      className={`user-presence-dot user-presence-dot--${size} user-presence-dot--${state}`}
      aria-label={title?.trim() ? `${STATE_LABELS[state]} — ${title.trim()}` : STATE_LABELS[state]}
      title={title?.trim() || STATE_LABELS[state]}
    />
  );
}
