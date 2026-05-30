import { formatCallDuration } from "@cco/shared/call-timeline";

/** End a solo call automatically when nobody else joins within this window. */
export const SOLO_CALL_AUTO_LEAVE_MS = 60 * 1000;

export const CALL_SUPERSEDED_NOTICE = "You joined this call from another location";

export function formatSoloCallAutoLeaveNotice(durationSeconds: number): string {
  const duration = formatCallDuration(Math.max(1, Math.floor(durationSeconds)));
  return `Call ended after ${duration} — no one else joined`;
}

/**
 * RealtimeKit `participants.count` tracks other joined peers only (self is excluded).
 */
export function isSoloCallRoom(otherParticipantCount: number): boolean {
  return otherParticipantCount === 0;
}

/** CCO session rows with joinedAt set and no leftAt. */
export function isSoloCallSession(sessionParticipantCount: number): boolean {
  return sessionParticipantCount <= 1;
}

/**
 * Apply solo-only UX (instant leave, 1-minute auto-leave) only when both the CCO
 * session and RealtimeKit room agree nobody else is present.
 */
export function shouldApplySoloCallBehavior(
  sessionParticipantCount: number,
  otherParticipantCount: number,
  othersJoinedInRoom = false,
): boolean {
  if (othersJoinedInRoom) return false;
  if (sessionParticipantCount > 1) return false;
  if (otherParticipantCount > 0) return false;
  return isSoloCallSession(sessionParticipantCount);
}
