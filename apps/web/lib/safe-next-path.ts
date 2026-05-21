/** Reject open redirects; allow only same-origin relative paths. */
export function safeNextPath(next: string | null, fallback = "/groups"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }
  return next;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export const secureCookie = { secure: isProduction() } as const;
