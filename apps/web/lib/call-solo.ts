/**
 * RealtimeKit `participants.count` tracks other joined peers only (self is excluded).
 * Solo means nobody else is in the room.
 */
export function isSoloCall(otherParticipantCount: number): boolean {
  return otherParticipantCount === 0;
}
