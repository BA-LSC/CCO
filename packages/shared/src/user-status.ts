export const USER_STATUS_PRESETS = ["active", "away", "busy"] as const;

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
};

export function parseUserStatusPreset(value: string | null | undefined): UserStatusPreset {
  if (value === "away" || value === "busy") return value;
  return "active";
}

export function resolvePresenceDotState(
  preset: UserStatusPreset,
  online: boolean,
): PresenceDotState {
  if (preset === "away") return "away";
  if (preset === "busy") return "busy";
  return online ? "online" : "offline";
}
