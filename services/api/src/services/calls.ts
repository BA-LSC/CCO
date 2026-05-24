import { createHash, randomBytes } from "node:crypto";
import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type {
  CallGuestPreview,
  CallInviteCandidateDto,
  CallJoinResponse,
  CallParticipantDto,
  CallSummaryDto,
} from "@cco/shared/calls";
import { db } from "../db";
import {
  callInviteTokens,
  callParticipants,
  callSessions,
  conversations,
  userPcoCredentials,
  users,
} from "../db/schema";
import { publishMessageEvent } from "../realtime/pubsub";
import type { RealtimeEvent } from "../realtime/events";
import { notifyIncomingCall } from "./push-notify";
import {
  addRealtimeKitParticipant,
  createRealtimeKitMeeting,
  isRealtimeKitConfigured,
  presetForRole,
  refreshRealtimeKitParticipantToken,
} from "./realtimekit";
import { getOrgPcoAccessToken } from "./org-config";
import { isConversationMember } from "./call-access";
const GUEST_INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

const ACTIVE_STATUSES = ["ringing", "active"] as const;

async function canAccessCall(params: {
  callSessionId: string;
  userId: string;
}): Promise<boolean> {
  const participant = await db
    .select({ id: callParticipants.id })
    .from(callParticipants)
    .where(
      and(
        eq(callParticipants.callSessionId, params.callSessionId),
        eq(callParticipants.userId, params.userId),
        isNull(callParticipants.leftAt),
      ),
    )
    .limit(1);
  if (participant[0]) return true;

  const call = await db
    .select({
      conversationId: callSessions.conversationId,
      hostUserId: callSessions.hostUserId,
    })
    .from(callSessions)
    .where(eq(callSessions.id, params.callSessionId))
    .limit(1);

  const session = call[0];
  if (!session) return false;
  if (session.hostUserId === params.userId) return true;
  return isConversationMember(session.conversationId, params.userId);
}

async function getUserDisplay(userId: string): Promise<{ displayName: string; avatarUrl: string | null }> {
  const row = await db
    .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    displayName: row[0]?.displayName ?? "Unknown",
    avatarUrl: row[0]?.avatarUrl ?? null,
  };
}

async function countActiveParticipants(callSessionId: string): Promise<number> {
  const rows = await db
    .select({ id: callParticipants.id })
    .from(callParticipants)
    .where(
      and(
        eq(callParticipants.callSessionId, callSessionId),
        isNull(callParticipants.leftAt),
        sql`${callParticipants.joinedAt} IS NOT NULL`,
      ),
    );
  return rows.length;
}

async function buildCallSummary(callSessionId: string): Promise<CallSummaryDto | null> {
  const row = await db
    .select({
      id: callSessions.id,
      conversationId: callSessions.conversationId,
      hostUserId: callSessions.hostUserId,
      status: callSessions.status,
      startedAt: callSessions.startedAt,
      endedAt: callSessions.endedAt,
      hostDisplayName: users.displayName,
    })
    .from(callSessions)
    .innerJoin(users, eq(users.id, callSessions.hostUserId))
    .where(eq(callSessions.id, callSessionId))
    .limit(1);

  const call = row[0];
  if (!call) return null;

  const participantCount = await countActiveParticipants(callSessionId);

  return {
    id: call.id,
    conversationId: call.conversationId,
    hostUserId: call.hostUserId,
    hostDisplayName: call.hostDisplayName,
    status: call.status as CallSummaryDto["status"],
    participantCount,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt?.toISOString() ?? null,
  };
}

async function publishCallEvent(
  conversationId: string,
  event: Extract<RealtimeEvent, { type: `call.${string}` }>,
): Promise<void> {
  await publishMessageEvent(event);
}

async function ensureParticipantToken(params: {
  callSessionId: string;
  meetingId: string;
  userId?: string | null;
  displayName: string;
  role: "host" | "member" | "guest";
  guestLabel?: string;
}): Promise<{ authToken: string; participantRowId: string }> {
  const existing = await db
    .select({
      id: callParticipants.id,
      realtimeKitParticipantId: callParticipants.realtimeKitParticipantId,
    })
    .from(callParticipants)
    .where(
      and(
        eq(callParticipants.callSessionId, params.callSessionId),
        params.userId
          ? eq(callParticipants.userId, params.userId)
          : eq(callParticipants.guestLabel, params.guestLabel ?? ""),
        isNull(callParticipants.leftAt),
      ),
    )
    .limit(1);

  const customId = params.userId ? params.userId : `guest:${params.guestLabel ?? "anon"}`;

  if (existing[0]?.realtimeKitParticipantId) {
    const refreshed = await refreshRealtimeKitParticipantToken({
      meetingId: params.meetingId,
      participantId: existing[0].realtimeKitParticipantId,
    });
    await db
      .update(callParticipants)
      .set({ joinedAt: new Date() })
      .where(eq(callParticipants.id, existing[0].id));
    return { authToken: refreshed.token, participantRowId: existing[0].id };
  }

  const added = await addRealtimeKitParticipant({
    meetingId: params.meetingId,
    name: params.displayName,
    presetName: presetForRole(params.role),
    customParticipantId: customId,
  });

  let participantRowId = existing[0]?.id;
  if (!participantRowId) {
    const inserted = await db
      .insert(callParticipants)
      .values({
        callSessionId: params.callSessionId,
        userId: params.userId || null,
        guestLabel: params.guestLabel ?? null,
        realtimeKitParticipantId: added.id,
        role: params.role,
        joinedAt: new Date(),
      })
      .returning({ id: callParticipants.id });
    participantRowId = inserted[0]!.id;
  } else {
    await db
      .update(callParticipants)
      .set({
        realtimeKitParticipantId: added.id,
        joinedAt: new Date(),
      })
      .where(eq(callParticipants.id, participantRowId));
  }

  return { authToken: added.token, participantRowId };
}

export async function getActiveCallForConversation(
  conversationId: string,
): Promise<CallSummaryDto | null> {
  const row = await db
    .select({ id: callSessions.id })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.conversationId, conversationId),
        inArray(callSessions.status, [...ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  if (!row[0]) return null;
  return buildCallSummary(row[0].id);
}

export async function startOrJoinConversationCall(params: {
  conversationId: string;
  userId: string;
  organizationId: string;
}): Promise<CallJoinResponse | null> {
  if (!(await isRealtimeKitConfigured())) {
    throw new Error("Video calls are not configured for this organization");
  }

  const isMember = await isConversationMember(params.conversationId, params.userId);
  if (!isMember) return null;

  const existing = await db
    .select({
      id: callSessions.id,
      meetingId: callSessions.realtimeKitMeetingId,
      hostUserId: callSessions.hostUserId,
      status: callSessions.status,
    })
    .from(callSessions)
    .where(
      and(
        eq(callSessions.conversationId, params.conversationId),
        inArray(callSessions.status, [...ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  const user = await getUserDisplay(params.userId);
  let callSessionId: string;
  let meetingId: string;
  let role: "host" | "member" = "member";
  let isNewCall = false;

  if (existing[0]) {
    callSessionId = existing[0].id;
    meetingId = existing[0].meetingId;
    role = existing[0].hostUserId === params.userId ? "host" : "member";
  } else {
    const conv = await db
      .select({ title: conversations.title })
      .from(conversations)
      .where(eq(conversations.id, params.conversationId))
      .limit(1);
    const meeting = await createRealtimeKitMeeting(conv[0]?.title ?? "CCO Call");
    meetingId = meeting.id;
    role = "host";
    isNewCall = true;

    const inserted = await db
      .insert(callSessions)
      .values({
        conversationId: params.conversationId,
        hostUserId: params.userId,
        realtimeKitMeetingId: meetingId,
        status: "ringing",
      })
      .returning({ id: callSessions.id });
    callSessionId = inserted[0]!.id;
  }

  const { authToken } = await ensureParticipantToken({
    callSessionId,
    meetingId,
    userId: params.userId,
    displayName: user.displayName,
    role,
  });

  if (isNewCall) {
    await db
      .update(callSessions)
      .set({ status: "active" })
      .where(eq(callSessions.id, callSessionId));

    const summary = (await buildCallSummary(callSessionId))!;
    await publishCallEvent(params.conversationId, {
      type: "call.started",
      conversationId: params.conversationId,
      call: summary,
    });

    void notifyIncomingCall({
      callId: callSessionId,
      conversationId: params.conversationId,
      hostUserId: params.userId,
      hostDisplayName: user.displayName,
    });
  } else {
    const summary = (await buildCallSummary(callSessionId))!;
    await publishCallEvent(params.conversationId, {
      type: "call.updated",
      conversationId: params.conversationId,
      call: summary,
    });
  }

  const call = (await buildCallSummary(callSessionId))!;
  return { call, authToken };
}

export async function joinCall(params: {
  callId: string;
  userId: string;
}): Promise<CallJoinResponse | null> {
  if (!(await canAccessCall({ callSessionId: params.callId, userId: params.userId }))) {
    return null;
  }

  const row = await db
    .select({
      conversationId: callSessions.conversationId,
      meetingId: callSessions.realtimeKitMeetingId,
      hostUserId: callSessions.hostUserId,
      status: callSessions.status,
    })
    .from(callSessions)
    .where(eq(callSessions.id, params.callId))
    .limit(1);

  const call = row[0];
  if (!call || call.status === "ended") return null;

  const user = await getUserDisplay(params.userId);
  const role = call.hostUserId === params.userId ? "host" : "member";
  const { authToken } = await ensureParticipantToken({
    callSessionId: params.callId,
    meetingId: call.meetingId,
    userId: params.userId,
    displayName: user.displayName,
    role,
  });

  if (call.status === "ringing") {
    await db.update(callSessions).set({ status: "active" }).where(eq(callSessions.id, params.callId));
  }

  const summary = (await buildCallSummary(params.callId))!;
  await publishCallEvent(call.conversationId, {
    type: "call.updated",
    conversationId: call.conversationId,
    call: summary,
  });

  return { call: summary, authToken };
}

export async function leaveCall(params: { callId: string; userId: string }): Promise<boolean> {
  const updated = await db
    .update(callParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(callParticipants.callSessionId, params.callId),
        eq(callParticipants.userId, params.userId),
        isNull(callParticipants.leftAt),
      ),
    )
    .returning({ id: callParticipants.id });

  if (updated.length === 0) return false;

  const call = await db
    .select({ conversationId: callSessions.conversationId })
    .from(callSessions)
    .where(eq(callSessions.id, params.callId))
    .limit(1);

  if (call[0]) {
    const summary = await buildCallSummary(params.callId);
    if (summary) {
      await publishCallEvent(call[0].conversationId, {
        type: "call.updated",
        conversationId: call[0].conversationId,
        call: summary,
      });
    }
  }

  return true;
}

export async function endCall(params: { callId: string; userId: string }): Promise<boolean> {
  const row = await db
    .select({
      hostUserId: callSessions.hostUserId,
      conversationId: callSessions.conversationId,
      status: callSessions.status,
    })
    .from(callSessions)
    .where(eq(callSessions.id, params.callId))
    .limit(1);

  const call = row[0];
  if (!call || call.status === "ended") return false;
  if (call.hostUserId !== params.userId) return false;

  await db
    .update(callSessions)
    .set({ status: "ended", endedAt: new Date() })
    .where(eq(callSessions.id, params.callId));

  await db
    .update(callParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(eq(callParticipants.callSessionId, params.callId), isNull(callParticipants.leftAt)),
    );

  await publishCallEvent(call.conversationId, {
    type: "call.ended",
    conversationId: call.conversationId,
    callId: params.callId,
  });

  return true;
}

export async function inviteToCall(params: {
  callId: string;
  userId: string;
  organizationId: string;
  targetUserId?: string;
  externalGuest?: boolean;
  webUrl: string;
}): Promise<{ inviteUrl?: string; invitedUserId?: string } | null> {
  const call = await db
    .select({
      hostUserId: callSessions.hostUserId,
      conversationId: callSessions.conversationId,
      status: callSessions.status,
    })
    .from(callSessions)
    .where(eq(callSessions.id, params.callId))
    .limit(1);

  const session = call[0];
  if (!session || session.status === "ended") return null;

  const canInvite =
    session.hostUserId === params.userId ||
    (await isConversationMember(session.conversationId, params.userId));
  if (!canInvite) return null;

  if (params.targetUserId) {
    await db
      .insert(callParticipants)
      .values({
        callSessionId: params.callId,
        userId: params.targetUserId,
        role: "member",
      })
      .onConflictDoNothing();

    const host = await getUserDisplay(session.hostUserId);
    void notifyIncomingCall({
      callId: params.callId,
      conversationId: session.conversationId,
      hostUserId: session.hostUserId,
      hostDisplayName: host.displayName,
      targetUserIds: [params.targetUserId],
    });

    return { invitedUserId: params.targetUserId };
  }

  if (params.externalGuest) {
    const raw = generateInviteToken();
    const expiresAt = new Date(Date.now() + GUEST_INVITE_TTL_MS);
    await db.insert(callInviteTokens).values({
      callSessionId: params.callId,
      tokenHash: hashInviteToken(raw),
      kind: "external",
      createdByUserId: params.userId,
      expiresAt,
      maxUses: 10,
    });

    return { inviteUrl: `${params.webUrl.replace(/\/$/, "")}/call/join/${raw}` };
  }

  return null;
}

export async function searchCallInviteCandidates(params: {
  organizationId: string;
  query?: string;
  limit?: number;
}): Promise<CallInviteCandidateDto[]> {
  const limit = Math.min(params.limit ?? 20, 50);
  const q = params.query?.trim();
  const conditions = [eq(users.organizationId, params.organizationId)];

  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, "")}%`;
    conditions.push(or(ilike(users.displayName, pattern), ilike(users.email, pattern))!);
  }

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      avatarUrl: users.avatarUrl,
      pcoPersonId: users.pcoPersonId,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(users.displayName)
    .limit(limit);

  const signedUp = await db
    .select({ userId: userPcoCredentials.userId })
    .from(userPcoCredentials)
    .where(
      inArray(
        userPcoCredentials.userId,
        rows.map((r) => r.id),
      ),
    );
  const onCcoSet = new Set(signedUp.map((r) => r.userId));

  const results: CallInviteCandidateDto[] = rows.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    email: row.email.includes("@placeholder.local") ? null : row.email,
    avatarUrl: row.avatarUrl,
    onCco: onCcoSet.has(row.id),
    source: "local" as const,
  }));

  if (q && results.length < limit) {
    const accessToken = await getOrgPcoAccessToken(params.organizationId);
    if (accessToken) {
      try {
        const res = await fetch(
          `https://api.planningcenteronline.com/people/v2/people?where[search_name]=${encodeURIComponent(q)}&per_page=${limit}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (res.ok) {
          const json = (await res.json()) as {
            data?: Array<{
              id: string;
              attributes?: { name?: string; avatar?: string; demographic_avatar_url?: string };
            }>;
          };
          const seen = new Set(results.map((r) => r.displayName.toLowerCase()));
          for (const person of json.data ?? []) {
            const name = person.attributes?.name?.trim();
            if (!name || seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            const local = rows.find((r) => r.pcoPersonId === person.id);
            results.push({
              id: local?.id ?? null,
              displayName: name,
              avatarUrl:
                person.attributes?.demographic_avatar_url ??
                person.attributes?.avatar ??
                null,
              onCco: local ? onCcoSet.has(local.id) : false,
              source: "pco",
            });
            if (results.length >= limit) break;
          }
        }
      } catch (err) {
        console.warn("PCO people search failed:", err);
      }
    }
  }

  return results;
}

async function resolveInviteToken(rawToken: string) {
  const tokenHash = hashInviteToken(rawToken);
  const row = await db
    .select({
      id: callInviteTokens.id,
      callSessionId: callInviteTokens.callSessionId,
      kind: callInviteTokens.kind,
      expiresAt: callInviteTokens.expiresAt,
      revokedAt: callInviteTokens.revokedAt,
      maxUses: callInviteTokens.maxUses,
      useCount: callInviteTokens.useCount,
      targetDisplayName: callInviteTokens.targetDisplayName,
    })
    .from(callInviteTokens)
    .where(eq(callInviteTokens.tokenHash, tokenHash))
    .limit(1);

  return row[0] ?? null;
}

export async function previewGuestCall(rawToken: string): Promise<CallGuestPreview | null> {
  const invite = await resolveInviteToken(rawToken);
  if (!invite) return { valid: false, callTitle: "", hostDisplayName: "", expiresAt: "" };

  const expired = invite.expiresAt.getTime() < Date.now();
  const revoked = invite.revokedAt != null;
  const overLimit = invite.useCount >= invite.maxUses;

  const call = await db
    .select({
      status: callSessions.status,
      conversationTitle: conversations.title,
      hostDisplayName: users.displayName,
    })
    .from(callSessions)
    .innerJoin(conversations, eq(conversations.id, callSessions.conversationId))
    .innerJoin(users, eq(users.id, callSessions.hostUserId))
    .where(eq(callSessions.id, invite.callSessionId))
    .limit(1);

  const valid =
    !expired && !revoked && !overLimit && call[0] != null && call[0].status !== "ended";

  return {
    valid,
    callTitle: call[0]?.conversationTitle ?? "Call",
    hostDisplayName: call[0]?.hostDisplayName ?? "Host",
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function joinCallAsGuest(params: {
  rawToken: string;
  displayName: string;
}): Promise<CallJoinResponse | null> {
  const invite = await resolveInviteToken(params.rawToken);
  if (!invite) return null;

  const expired = invite.expiresAt.getTime() < Date.now();
  const revoked = invite.revokedAt != null;
  const overLimit = invite.useCount >= invite.maxUses;
  if (expired || revoked || overLimit) return null;

  const call = await db
    .select({
      id: callSessions.id,
      conversationId: callSessions.conversationId,
      meetingId: callSessions.realtimeKitMeetingId,
      status: callSessions.status,
    })
    .from(callSessions)
    .where(eq(callSessions.id, invite.callSessionId))
    .limit(1);

  if (!call[0] || call[0].status === "ended") return null;

  const guestName = params.displayName.trim().slice(0, 80) || invite.targetDisplayName || "Guest";

  const { authToken } = await ensureParticipantToken({
    callSessionId: call[0].id,
    meetingId: call[0].meetingId,
    displayName: guestName,
    role: "guest",
    guestLabel: `${guestName}:${invite.id}`,
  });

  await db
    .update(callInviteTokens)
    .set({ useCount: invite.useCount + 1 })
    .where(eq(callInviteTokens.id, invite.id));

  if (call[0].status === "ringing") {
    await db.update(callSessions).set({ status: "active" }).where(eq(callSessions.id, call[0].id));
  }

  const summary = (await buildCallSummary(call[0].id))!;
  await publishCallEvent(call[0].conversationId, {
    type: "call.updated",
    conversationId: call[0].conversationId,
    call: summary,
  });

  return { call: summary, authToken };
}

export async function listCallParticipants(callId: string): Promise<CallParticipantDto[]> {
  const rows = await db
    .select({
      id: callParticipants.id,
      userId: callParticipants.userId,
      guestLabel: callParticipants.guestLabel,
      role: callParticipants.role,
      joinedAt: callParticipants.joinedAt,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(callParticipants)
    .leftJoin(users, eq(users.id, callParticipants.userId))
    .where(and(eq(callParticipants.callSessionId, callId), isNull(callParticipants.leftAt)));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName ?? row.guestLabel ?? "Guest",
    avatarUrl: row.avatarUrl,
    role: row.role as CallParticipantDto["role"],
    joined: row.joinedAt != null,
  }));
}

export async function getUserActiveCallId(userId: string): Promise<string | null> {
  const row = await db
    .select({ callSessionId: callParticipants.callSessionId })
    .from(callParticipants)
    .innerJoin(callSessions, eq(callSessions.id, callParticipants.callSessionId))
    .where(
      and(
        eq(callParticipants.userId, userId),
        isNull(callParticipants.leftAt),
        sql`${callParticipants.joinedAt} IS NOT NULL`,
        inArray(callSessions.status, [...ACTIVE_STATUSES]),
      ),
    )
    .limit(1);

  return row[0]?.callSessionId ?? null;
}
