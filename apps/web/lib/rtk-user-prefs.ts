export const RTK_PREFS_STORAGE_KEY = "rtk-prefs";

/** Matches RealtimeKit default (`mirror-video` pref defaults to true). */
export function parseRtkMirrorVideoPref(raw: string | null): boolean {
  try {
    const prefs = JSON.parse(raw || "{}") as Record<string, string>;
    return prefs["mirror-video"] ? prefs["mirror-video"] === "true" : true;
  } catch {
    return true;
  }
}

export function readRtkMirrorVideoPref(): boolean {
  if (typeof window === "undefined") return true;
  return parseRtkMirrorVideoPref(window.localStorage.getItem(RTK_PREFS_STORAGE_KEY));
}
