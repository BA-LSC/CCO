import { z } from "zod";

export const CallStatusSchema = z.enum(["ringing", "active", "ended"]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const CallParticipantRoleSchema = z.enum(["host", "member", "guest"]);
export type CallParticipantRole = z.infer<typeof CallParticipantRoleSchema>;

export const CallInviteKindSchema = z.enum(["member", "guest", "external"]);
export type CallInviteKind = z.infer<typeof CallInviteKindSchema>;

export const CallParticipantDtoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  role: CallParticipantRoleSchema,
  joined: z.boolean(),
});

export type CallParticipantDto = z.infer<typeof CallParticipantDtoSchema>;

export const CallSummaryDtoSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  hostUserId: z.string().uuid(),
  hostDisplayName: z.string(),
  status: CallStatusSchema,
  participantCount: z.number().int(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
});

export type CallSummaryDto = z.infer<typeof CallSummaryDtoSchema>;

/** Callee join flows (Answer, Join call, ?call= deep link) — not the host who started the call. */
export function canJoinCallAsParticipant(
  call: Pick<CallSummaryDto, "hostUserId">,
  userId: string | null | undefined,
): boolean {
  return Boolean(userId && call.hostUserId !== userId);
}

export const CallJoinResponseSchema = z.object({
  call: CallSummaryDtoSchema,
  authToken: z.string(),
});

export type CallJoinResponse = z.infer<typeof CallJoinResponseSchema>;

export const CallInviteCandidateDtoSchema = z.object({
  id: z.string().uuid().nullable(),
  displayName: z.string(),
  email: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  onCco: z.boolean(),
  source: z.enum(["local", "pco"]),
});

export type CallInviteCandidateDto = z.infer<typeof CallInviteCandidateDtoSchema>;

export const CallGuestPreviewSchema = z.object({
  callTitle: z.string(),
  hostDisplayName: z.string(),
  expiresAt: z.string(),
  valid: z.boolean(),
});

export type CallGuestPreview = z.infer<typeof CallGuestPreviewSchema>;

export const CallInviteResponseSchema = z.object({
  inviteUrl: z.string().optional(),
  invitedUserId: z.string().uuid().optional(),
});

export type CallInviteResponse = z.infer<typeof CallInviteResponseSchema>;
