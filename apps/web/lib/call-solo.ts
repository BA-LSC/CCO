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
 * Apply solo-only UX (instant leave, 5-minute auto-leave) only when both the CCO
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
