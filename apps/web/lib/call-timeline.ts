import {
  collapseCallTimelineEvents,
  formatCallLiveDuration,
  formatCallTimelineLabel,
  type CallTimelineEventDto,
} from "@cco/shared/call-timeline";
import type { Message } from "@/lib/api";

export type { CallTimelineEventDto };
export { formatCallLiveDuration, formatCallTimelineLabel };

export type ThreadTimelineItem =
  | { kind: "message"; at: string; message: Message }
  | { kind: "call"; at: string; call: CallTimelineEventDto };

export function mergeCallTimelineEvents(
  existing: CallTimelineEventDto[],
  incoming: CallTimelineEventDto[],
): CallTimelineEventDto[] {
  const byId = new Map<string, CallTimelineEventDto>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

export function upsertCallTimelineEvent(
  existing: CallTimelineEventDto[],
  event: CallTimelineEventDto,
): CallTimelineEventDto[] {
  return mergeCallTimelineEvents(
    existing.filter((item) => item.id !== event.id),
    [event],
  );
}

export function buildThreadTimeline(
  messages: Message[],
  callEvents: CallTimelineEventDto[],
): ThreadTimelineItem[] {
  const collapsedCalls = collapseCallTimelineEvents(callEvents);
  const items: ThreadTimelineItem[] = [
    ...messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...collapsedCalls.map((call) => ({ kind: "call" as const, at: call.at, call })),
  ];
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return groupConsecutiveMissedCallTimelineItems(items);
}

function groupConsecutiveMissedCallTimelineItems(
  items: ThreadTimelineItem[],
): ThreadTimelineItem[] {
  const grouped: ThreadTimelineItem[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== "call" || item.call.kind !== "missed") {
      grouped.push(item);
      continue;
    }

    let end = index + 1;
    while (end < items.length) {
      const next = items[end];
      if (next?.kind !== "call" || next.call.kind !== "missed") break;
      end += 1;
    }

    const count = end - index;
    if (count === 1) {
      grouped.push(item);
    } else {
      const last = items[end - 1] as Extract<ThreadTimelineItem, { kind: "call" }>;
      grouped.push({
        kind: "call",
        at: item.at,
        call: {
          ...item.call,
          id: `missed-group:${item.call.callId}:${last.call.callId}`,
          missedCount: count,
        },
      });
    }

    index = end - 1;
  }

  return grouped;
}

export function threadItemStartsNewDay(
  items: { at: string }[],
  index: number,
): boolean {
  if (index <= 0) return true;
  const current = new Date(items[index]!.at);
  const previous = new Date(items[index - 1]!.at);
  return (
    current.getFullYear() !== previous.getFullYear() ||
    current.getMonth() !== previous.getMonth() ||
    current.getDate() !== previous.getDate()
  );
}
