export const PRESENCE_KEY_PREFIX = "cco:presence:";
export const PRESENCE_TTL_SECONDS = 45;

export function presenceKey(userId: string): string {
  return `${PRESENCE_KEY_PREFIX}${userId}`;
}
