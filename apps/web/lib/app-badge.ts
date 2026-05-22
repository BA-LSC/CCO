export function appBadgeSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

export async function syncAppBadge(unreadCount: number): Promise<void> {
  if (!appBadgeSupported()) return;

  try {
    if (unreadCount > 0) {
      await navigator.setAppBadge!(unreadCount);
    } else {
      await navigator.clearAppBadge!();
    }
  } catch {
    // Badging may be unavailable on this platform or permission denied.
  }
}
