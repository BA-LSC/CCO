import { isStandaloneDisplay } from "@/lib/add-to-homescreen";

export const PWA_SIDEBAR_SWIPE_EDGE_PX = 28;
export const PWA_SIDEBAR_SWIPE_OPEN_RATIO = 0.35;
export const PWA_HISTORY_GUARD_KEY = "cco-pwa-nav-guard";

export function isPwaSidebarSwipeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!isStandaloneDisplay()) return false;
  if (window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches) {
    return false;
  }
  return window.matchMedia("(max-width: 768px)").matches;
}

export function resolveSidebarReveal(
  revealPx: number,
  sidebarWidth: number,
): "open" | "closed" {
  if (sidebarWidth <= 0) return "closed";
  return revealPx >= sidebarWidth * PWA_SIDEBAR_SWIPE_OPEN_RATIO ? "open" : "closed";
}

export function clampSidebarReveal(revealPx: number, sidebarWidth: number): number {
  return Math.max(0, Math.min(sidebarWidth, revealPx));
}
