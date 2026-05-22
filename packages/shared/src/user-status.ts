export const USER_STATUS_PRESETS = ["active", "away", "busy", "offline"] as const;

export type UserStatusPreset = (typeof USER_STATUS_PRESETS)[number];

export type UserStatus = {
  preset: UserStatusPreset;
  message: string | null;
};

export type PresenceDotState = "online" | "offline" | "away" | "busy";

export const USER_STATUS_LABELS: Record<UserStatusPreset, string> = {
  active: "Active",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
};

export function parseUserStatusPreset(value: string | null | undefined): UserStatusPreset {
  if (value === "away" || value === "busy" || value === "offline") return value;
  return "active";
}

/** True when the user has manually chosen a preset or status message. */
export function isManualUserStatus(status: UserStatus): boolean {
  return status.preset !== "active" || status.message != null;
}

export function resolveEffectivePreset(
  status: UserStatus,
  activity: { pageActive: boolean; idle: boolean },
): UserStatusPreset {
  if (isManualUserStatus(status)) return status.preset;
  if (activity.pageActive && !activity.idle) return "active";
  return "away";
}

export function resolvePresenceDotState(
  preset: UserStatusPreset,
  online: boolean,
): PresenceDotState {
  if (preset === "offline") return "offline";
  if (preset === "away") return "away";
  if (preset === "busy") return "busy";
  if (online) return "online";
  return "away";
}
