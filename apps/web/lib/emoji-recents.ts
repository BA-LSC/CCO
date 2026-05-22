const STORAGE_KEY = "cco:emoji-recents";
const MAX_RECENTS = 24;

export function readRecentEmojis(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((emoji): emoji is string => typeof emoji === "string" && emoji.length > 0);
  } catch {
    return [];
  }
}

export function writeRecentEmojis(emojis: string[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emojis.slice(0, MAX_RECENTS)));
  } catch {
    // Ignore storage quota or privacy mode errors.
  }
}

export function pushRecentEmoji(emoji: string, current: readonly string[]): string[] {
  const next = [emoji, ...current.filter((item) => item !== emoji)].slice(0, MAX_RECENTS);
  writeRecentEmojis(next);
  return next;
}
