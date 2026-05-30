export const WELCOME_SEEN_KEY = "cco:welcome-seen";

export function hasWelcomeSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}
