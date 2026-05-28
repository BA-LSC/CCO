export function normalizeReleaseSha(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase();
  return trimmed || null;
}

/** True when two SHAs refer to the same commit (full or short GitHub form). */
export function releaseShasEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeReleaseSha(a);
  const right = normalizeReleaseSha(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const short = left.length <= right.length ? left : right;
  const long = left.length <= right.length ? right : left;
  return short.length >= 7 && long.startsWith(short);
}

export function isUpdateAvailable(
  current: string | null | undefined,
  latest: string | null | undefined,
): boolean {
  const latestNorm = normalizeReleaseSha(latest);
  if (!latestNorm) return false;

  const currentNorm = normalizeReleaseSha(current);
  if (!currentNorm) return true;
  return !releaseShasEqual(currentNorm, latestNorm);
}

/** Labels for Admin Updates; widens when a 12-char prefix would hide a real mismatch. */
export function formatReleaseShaPair(
  installed: string | null | undefined,
  latest: string | null | undefined,
): { installed: string; latest: string } {
  const left = installed?.trim() || "Unknown";
  const right = latest?.trim() || "Unknown";
  const shortLabel = (value: string) =>
    value.length > 12 ? `${value.slice(0, 12)}…` : value;

  if (
    left !== right &&
    left !== "Unknown" &&
    right !== "Unknown" &&
    shortLabel(left) === shortLabel(right)
  ) {
    const distinctLabel = (value: string) => {
      if (value.length <= 16) return value;
      return `${value.slice(0, 12)}…${value.slice(-4)}`;
    };
    return { installed: distinctLabel(left), latest: distinctLabel(right) };
  }

  return { installed: shortLabel(left), latest: shortLabel(right) };
}
