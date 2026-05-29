import { and, eq, gte, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import {
  buildCallTimelineEvents,
  type CallTimelineEventDto,
} from "@cco/shared/call-timeline";
import { db } from "../db";
import { callParticipants, callSessions } from "../db/schema";

export async function countJoinedParticipants(callSessionId: string): Promise<number> {
  const rows = await db
    .select({ id: callParticipants.id })
    .from(callParticipants)
    .where(
      and(
        eq(callParticipants.callSessionId, callSessionId),
        isNotNull(callParticipants.joinedAt),
      ),
    );
  return rows.length;
}

export async function buildCallTimelineEventsForSession(
  callSessionId: string,
): Promise<CallTimelineEventDto[]> {
  const row = await db
    .select({
      id: callSessions.id,
      startedAt: callSessions.startedAt,
      endedAt: callSessions.endedAt,
    })
    .from(callSessions)
    .where(eq(callSessions.id, callSessionId))
    .limit(1);

  const call = row[0];
  if (!call) return [];

  const joinedParticipantCount = await countJoinedParticipants(callSessionId);
  return buildCallTimelineEvents({
    callId: call.id,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
    joinedParticipantCount,
  });
}

export async function listCallTimelineEvents(
  conversationId: string,
  range?: { from?: Date; to?: Date; toExclusive?: boolean },
): Promise<CallTimelineEventDto[]> {
  const conditions = [eq(callSessions.conversationId, conversationId)];

  if (range?.from || range?.to) {
    const from = range.from;
    const to = range.to;
    const toExclusive = range.toExclusive ?? false;
    const sessionClauses = [];

    if (from && to) {
      sessionClauses.push(
        and(
          gte(callSessions.startedAt, from),
          toExclusive ? lt(callSessions.startedAt, to) : lte(callSessions.startedAt, to),
        ),
      );
      sessionClauses.push(
        and(
          isNotNull(callSessions.endedAt),
          gte(callSessions.endedAt, from),
          toExclusive ? lt(callSessions.endedAt, to) : lte(callSessions.endedAt, to),
        ),
      );
      sessionClauses.push(
        and(
          lt(callSessions.startedAt, from),
          or(isNull(callSessions.endedAt), gte(callSessions.endedAt, from)),
        ),
      );
    } else if (from) {
      sessionClauses.push(
        or(
          gte(callSessions.startedAt, from),
          and(isNotNull(callSessions.endedAt), gte(callSessions.endedAt, from)),
          isNull(callSessions.endedAt),
        ),
      );
    } else if (to) {
      sessionClauses.push(toExclusive ? lt(callSessions.startedAt, to) : lte(callSessions.startedAt, to));
    }

    if (sessionClauses.length > 0) {
      conditions.push(or(...sessionClauses)!);
    }
  }

  const rows = await db
    .select({
      id: callSessions.id,
      startedAt: callSessions.startedAt,
      endedAt: callSessions.endedAt,
    })
    .from(callSessions)
    .where(and(...conditions))
    .orderBy(callSessions.startedAt);

  const events: CallTimelineEventDto[] = [];
  for (const call of rows) {
    const joinedParticipantCount = await countJoinedParticipants(call.id);
    events.push(
      ...buildCallTimelineEvents({
        callId: call.id,
        startedAt: call.startedAt.toISOString(),
        endedAt: call.endedAt?.toISOString() ?? null,
        joinedParticipantCount,
      }),
    );
  }

  if (!range?.from && !range?.to) return events;

  return events.filter((event) => {
    const at = new Date(event.at).getTime();
    if (range.from && at < range.from.getTime()) return false;
    if (range.to) {
      const upper = range.to.getTime();
      if (range.toExclusive ? at >= upper : at > upper) return false;
    }
    return true;
  });
}
