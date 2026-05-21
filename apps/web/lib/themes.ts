export const USER_THEMES = ["1", "2", "3", "4", "5", "6"] as const;
export type UserTheme = (typeof USER_THEMES)[number];

export const THEME_LABELS: Record<UserTheme, string> = {
  "1": "Signal",
  "2": "Midnight",
  "3": "Forest",
  "4": "Sunset",
  "5": "Paper",
  "6": "CHAOS",
};

export const THEME_STORAGE_KEY = "cco-theme";
export const CHAOS_UNLOCK_CLICKS = 8;
export const CHAOS_UNLOCK_WINDOW_MS = 2000;

export function isUserTheme(value: string): value is UserTheme {
  return (USER_THEMES as readonly string[]).includes(value);
}

export function applyThemeToDocument(theme: UserTheme) {
  document.documentElement.dataset.theme = theme;
  if (theme === "6") {
    document.documentElement.classList.add("theme-chaos-active");
  } else {
    document.documentElement.classList.remove("theme-chaos-active");
  }
}
