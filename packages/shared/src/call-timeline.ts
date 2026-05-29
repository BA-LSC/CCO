import { z } from "zod";

export const CallTimelineKindSchema = z.enum(["started", "missed", "ended"]);
export type CallTimelineKind = z.infer<typeof CallTimelineKindSchema>;

export const CallTimelineEventDtoSchema = z.object({
  id: z.string(),
  callId: z.string().uuid(),
  kind: CallTimelineKindSchema,
  at: z.string(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

export type CallTimelineEventDto = z.infer<typeof CallTimelineEventDtoSchema>;

export function formatCallDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainderSeconds = seconds % 60;
  if (minutes < 60) {
    return remainderSeconds > 0 ? `${minutes}m ${remainderSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes > 0 ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}

export function formatCallTimelineLabel(event: Pick<CallTimelineEventDto, "kind" | "durationSeconds">): string {
  if (event.kind === "started") return "Call started";
  if (event.kind === "missed") return "Missed call";
  const duration = event.durationSeconds ?? 0;
  return `Call ended • ${formatCallDuration(duration)}`;
}

export function callTimelineEventId(callId: string, kind: CallTimelineKind): string {
  return `${callId}:${kind}`;
}

export function buildCallTimelineEvents(params: {
  callId: string;
  startedAt: string;
  endedAt: string | null;
  joinedParticipantCount: number;
}): CallTimelineEventDto[] {
  const events: CallTimelineEventDto[] = [
    {
      id: callTimelineEventId(params.callId, "started"),
      callId: params.callId,
      kind: "started",
      at: params.startedAt,
    },
  ];

  if (!params.endedAt) return events;

  const startedMs = new Date(params.startedAt).getTime();
  const endedMs = new Date(params.endedAt).getTime();
  const durationSeconds = Math.max(0, Math.round((endedMs - startedMs) / 1000));

  if (params.joinedParticipantCount >= 2) {
    events.push({
      id: callTimelineEventId(params.callId, "ended"),
      callId: params.callId,
      kind: "ended",
      at: params.endedAt,
      durationSeconds,
    });
    return events;
  }

  events.push({
    id: callTimelineEventId(params.callId, "missed"),
    callId: params.callId,
    kind: "missed",
    at: params.endedAt,
  });
  return events;
}
