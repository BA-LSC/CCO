export const USER_THEMES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
] as const;
export type UserTheme = (typeof USER_THEMES)[number];

export const PICKER_THEMES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
export type PickerTheme = (typeof PICKER_THEMES)[number];

export const CHAOS_THEME = "11" as const satisfies UserTheme;

export const THEME_LABELS: Record<UserTheme, string> = {
  "1": "Signal",
  "2": "Cobalt",
  "3": "Violet",
  "4": "Emerald",
  "5": "Rose",
  "6": "Amber",
  "7": "Teal",
  "8": "Crimson",
  "9": "Slate",
  "10": "Indigo",
  "11": "CHAOS",
};

/** Mini swatch colors for theme dropdown previews (matches themes.css accents). */
export const THEME_SWATCHES: Record<PickerTheme, { primary: string; primaryHover: string }> = {
  "1": { primary: "#3b9eff", primaryHover: "#61b3ff" },
  "2": { primary: "#2563eb", primaryHover: "#3b82f6" },
  "3": { primary: "#8b5cf6", primaryHover: "#a78bfa" },
  "4": { primary: "#10b981", primaryHover: "#34d399" },
  "5": { primary: "#f43f5e", primaryHover: "#fb7185" },
  "6": { primary: "#f59e0b", primaryHover: "#fbbf24" },
  "7": { primary: "#14b8a6", primaryHover: "#2dd4bf" },
  "8": { primary: "#dc2626", primaryHover: "#ef4444" },
  "9": { primary: "#94a3b8", primaryHover: "#cbd5e1" },
  "10": { primary: "#6366f1", primaryHover: "#818cf8" },
};

export const THEME_STORAGE_KEY = "cco-theme";
export const CHAOS_UNLOCK_CLICKS = 8;
export const CHAOS_UNLOCK_WINDOW_MS = 2000;

export function isUserTheme(value: string): value is UserTheme {
  return (USER_THEMES as readonly string[]).includes(value);
}

export function isPickerTheme(value: string): value is PickerTheme {
  return (PICKER_THEMES as readonly string[]).includes(value);
}

export function applyThemeToDocument(theme: UserTheme) {
  document.documentElement.dataset.theme = theme;
  if (theme === CHAOS_THEME) {
    document.documentElement.classList.add("theme-chaos-active");
  } else {
    document.documentElement.classList.remove("theme-chaos-active");
  }
}
