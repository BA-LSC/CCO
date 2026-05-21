export type AddToHomeScreenPlatform = "ios" | "android" | "other";

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true;

  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

export function isMobileInstallContext(): boolean {
  if (typeof window === "undefined") return false;

  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);

  if (!isIos && !isAndroid) return false;

  return (
    window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(hover: none)").matches ||
    window.matchMedia("(max-width: 900px)").matches
  );
}

export function getAddToHomeScreenPlatform(): AddToHomeScreenPlatform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export const ADD_TO_HOMESCREEN_DISMISS_KEY = "cco-add-to-homescreen-dismissed";
export const ADD_TO_HOMESCREEN_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

export function isAddToHomeScreenDismissed(): boolean {
  try {
    const raw = localStorage.getItem(ADD_TO_HOMESCREEN_DISMISS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { at?: number };
    if (typeof parsed.at !== "number") return false;
    return Date.now() - parsed.at < ADD_TO_HOMESCREEN_DISMISS_MS;
  } catch {
    return false;
  }
}

export function dismissAddToHomeScreen(): void {
  localStorage.setItem(
    ADD_TO_HOMESCREEN_DISMISS_KEY,
    JSON.stringify({ at: Date.now() }),
  );
}

export function shouldShowAddToHomeScreenBanner(): boolean {
  if (isStandaloneDisplay()) return false;
  if (!isMobileInstallContext()) return false;
  if (isAddToHomeScreenDismissed()) return false;
  return true;
}
