export const USER_THEMES = ["1", "2", "3", "4", "5", "6"] as const;
export type UserTheme = (typeof USER_THEMES)[number];

export function parseUserTheme(value: unknown): UserTheme | null {
  if (typeof value !== "string") return null;
  return USER_THEMES.includes(value as UserTheme) ? (value as UserTheme) : null;
}
