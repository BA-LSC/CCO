import { z } from "zod";

export const CallTimelineKindSchema = z.enum(["started", "missed", "ended"]);
export type CallTimelineKind = z.infer<typeof CallTimelineKindSchema>;

export const CallTimelineEventDtoSchema = z.object({
  id: z.string(),
  callId: z.string().uuid(),
  kind: CallTimelineKindSchema,
  at: z.string(),
  durationSeconds: z.number().int().nonnegative().optional(),
  missedCount: z.number().int().positive().optional(),
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

/** Live call timer (M:SS or H:MM:SS). */
export function formatCallLiveDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainderSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainderSeconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainderSeconds).padStart(2, "0")}`;
}

export function formatCallTimelineLabel(
  event: Pick<CallTimelineEventDto, "kind" | "durationSeconds" | "missedCount">,
): string {
  if (event.kind === "started") return "Call started";
  if (event.kind === "missed") {
    const count = event.missedCount ?? 1;
    return count === 1 ? "Missed call" : `${count} missed calls`;
  }
  const duration = event.durationSeconds ?? 0;
  return `Ended call • ${formatCallDuration(duration)}`;
}

export function collapseCallTimelineEvents(events: CallTimelineEventDto[]): CallTimelineEventDto[] {
  const byCallId = new Map<
    string,
    { started?: CallTimelineEventDto; terminal?: CallTimelineEventDto }
  >();

  for (const event of events) {
    const entry = byCallId.get(event.callId) ?? {};
    if (event.kind === "started") {
      entry.started = event;
    } else {
      entry.terminal = event;
    }
    byCallId.set(event.callId, entry);
  }

  const collapsed: CallTimelineEventDto[] = [];
  for (const entry of byCallId.values()) {
    const { started, terminal } = entry;
    if (started && terminal) {
      collapsed.push({ ...terminal, at: started.at });
    } else if (started) {
      collapsed.push(started);
    } else if (terminal) {
      collapsed.push(terminal);
    }
  }

  return collapsed.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** Merge back-to-back missed call rows into one grouped divider. */
export function groupConsecutiveMissedCallEvents(
  events: CallTimelineEventDto[],
): CallTimelineEventDto[] {
  const grouped: CallTimelineEventDto[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.kind !== "missed") {
      grouped.push(event);
      continue;
    }

    let end = index + 1;
    while (end < events.length && events[end]!.kind === "missed") {
      end += 1;
    }

    const count = end - index;
    if (count === 1) {
      grouped.push(event);
    } else {
      const last = events[end - 1]!;
      grouped.push({
        ...event,
        id: `missed-group:${event.callId}:${last.callId}`,
        missedCount: count,
      });
    }

    index = end - 1;
  }

  return grouped;
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
