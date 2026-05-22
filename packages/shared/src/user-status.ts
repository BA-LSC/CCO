export const USER_STATUS_PRESETS = ["active", "away", "busy", "offline"] as const;

export type UserStatusPreset = (typeof USER_STATUS_PRESETS)[number];

/** Presets shown in the status picker (legacy away/busy remain in storage only). */
export const USER_STATUS_PICKER_PRESETS = ["active", "offline"] as const;

export type UserStatusPickerPreset = (typeof USER_STATUS_PICKER_PRESETS)[number];

export type UserStatus = {
  preset: UserStatusPreset;
  message: string | null;
};

export type PresenceDotState = "online" | "offline" | "away" | "busy";

export const USER_STATUS_LABELS: Record<UserStatusPickerPreset, string> = {
  active: "Active",
  offline: "Offline",
};

export function normalizeUserStatusPreset(
  preset: UserStatusPreset,
): UserStatusPickerPreset {
  return preset === "offline" ? "offline" : "active";
}

export function parseUserStatusPreset(value: string | null | undefined): UserStatusPreset {
  if (value === "offline") return "offline";
  return "active";
}

/** True when the user has manually chosen offline or set a status message. */
export function isManualUserStatus(status: UserStatus): boolean {
  return status.preset === "offline" || status.message != null;
}

export function resolveEffectivePreset(
  status: UserStatus,
  _activity: { pageActive: boolean; idle: boolean },
): UserStatusPreset {
  void _activity;
  return normalizeUserStatusPreset(status.preset);
}

export function resolvePresenceDotState(
  preset: UserStatusPreset,
  online: boolean,
): PresenceDotState {
  if (normalizeUserStatusPreset(preset) === "offline") return "offline";
  return online ? "online" : "offline";
}
