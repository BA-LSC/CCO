"use client";

import type { CallJoinResponse, CallSummaryDto } from "@cco/shared/calls";
import { apiFetch } from "@/lib/api";

export async function startOrJoinCall(conversationId: string): Promise<CallJoinResponse> {
  return apiFetch<CallJoinResponse>(`/api/v1/conversations/${conversationId}/calls`, {
    method: "POST",
  });
}

export async function fetchActiveCall(
  conversationId: string,
): Promise<{ call: CallSummaryDto | null }> {
  return apiFetch<{ call: CallSummaryDto | null }>(
    `/api/v1/conversations/${conversationId}/calls/active`,
  );
}

export async function joinCallById(callId: string): Promise<CallJoinResponse> {
  return apiFetch<CallJoinResponse>(`/api/v1/calls/${callId}/join`, { method: "POST" });
}

export async function leaveCall(callId: string): Promise<void> {
  await apiFetch(`/api/v1/calls/${callId}/leave`, { method: "POST" });
}

export async function endCall(callId: string): Promise<void> {
  await apiFetch(`/api/v1/calls/${callId}/end`, { method: "POST" });
}

export async function inviteToCall(params: {
  callId: string;
  targetUserId?: string;
  externalGuest?: boolean;
}): Promise<{ inviteUrl?: string; invitedUserId?: string }> {
  return apiFetch(`/api/v1/calls/${params.callId}/invite`, {
    method: "POST",
    body: JSON.stringify({
      targetUserId: params.targetUserId,
      externalGuest: params.externalGuest,
    }),
  });
}

export async function searchCallInviteCandidates(
  query?: string,
): Promise<{ people: import("@cco/shared/calls").CallInviteCandidateDto[] }> {
  const path = query
    ? `/api/v1/calls/invite-candidates?q=${encodeURIComponent(query)}`
    : "/api/v1/calls/invite-candidates";
  return apiFetch(path);
}

export async function previewGuestCall(token: string) {
  return apiFetch<import("@cco/shared/calls").CallGuestPreview>("/api/v1/calls/guest/preview", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function joinGuestCall(token: string, displayName: string): Promise<CallJoinResponse> {
  return apiFetch<CallJoinResponse>("/api/v1/calls/guest/join", {
    method: "POST",
    body: JSON.stringify({ token, displayName }),
  });
}
