import {
  formatCallTimelineLabel,
  type CallTimelineEventDto,
} from "@cco/shared/call-timeline";
import type { Message } from "@/lib/api";

export type { CallTimelineEventDto };
export { formatCallTimelineLabel };

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
  const items: ThreadTimelineItem[] = [
    ...messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...callEvents.map((call) => ({ kind: "call" as const, at: call.at, call })),
  ];
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return items;
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
