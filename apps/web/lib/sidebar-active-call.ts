import type { CallSummaryDto } from "@cco/shared/calls";

export function resolveSidebarActiveCall(
  conversationId: string,
  mapCall: CallSummaryDto | undefined,
  sessionCall: CallSummaryDto | null | undefined,
): CallSummaryDto | undefined {
  if (mapCall) return mapCall;
  if (
    sessionCall?.conversationId === conversationId &&
    sessionCall.participantCount > 0
  ) {
    return sessionCall;
  }
  return undefined;
}
