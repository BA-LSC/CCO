"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PanelHeaderPhoneIcon } from "@/components/PanelHeaderIcons";
import { canJoinCallAsParticipant } from "@cco/shared/calls";
import { useChatLayout } from "@/components/ChatLayoutContext";
import { useOptionalActiveCall } from "@/components/calls/ConversationCallContext";

type Props = {
  conversationId: string;
  participantCount: number;
  hostUserId: string;
  /** DM rows show the phone icon only; groups/teams keep the participant count. */
  iconOnly?: boolean;
};

export function SidebarCallIndicator({
  conversationId,
  participantCount,
  hostUserId,
  iconOnly = false,
}: Props) {
  const router = useRouter();
  const { session } = useChatLayout();
  const callCtx = useOptionalActiveCall();
  const call = { hostUserId };
  const mayJoinAsCallee = canJoinCallAsParticipant(call, session?.userId);
  const inCall = callCtx?.inCall ?? false;
  const inCallHere = callCtx?.inCallOnConversation(conversationId) ?? false;
  const homeChatPath = callCtx?.homeChatPath;

  const label = `Active call, ${participantCount} participant${
    participantCount === 1 ? "" : "s"
  }`;

  const content = (
    <>
      <PanelHeaderPhoneIcon className="sidebar-call-indicator-icon" />
      {!iconOnly && (
        <span className="sidebar-call-indicator-count">{participantCount}</span>
      )}
    </>
  );

  const className = `sidebar-call-indicator sidebar-call-indicator--action${
    iconOnly ? " sidebar-call-indicator--icon-only" : ""
  }`;

  if (inCall && inCallHere && homeChatPath) {
    return (
      <Link
        href={homeChatPath}
        className={className}
        aria-label={`Return to call, ${label}`}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </Link>
    );
  }

  if (!inCall) {
    if (!mayJoinAsCallee) {
      return (
        <span
          className={`${className} sidebar-call-indicator--passive`}
          aria-label={label}
        >
          {content}
        </span>
      );
    }
    return (
      <button
        type="button"
        className={className}
        aria-label={`Join call, ${label}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          callCtx?.joinConversation(conversationId);
        }}
      >
        {content}
      </button>
    );
  }

  if (inCall && homeChatPath && !inCallHere) {
    return (
      <button
        type="button"
        className={className}
        aria-label={`Return to your call, ${label}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          router.push(homeChatPath);
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={`sidebar-call-indicator${iconOnly ? " sidebar-call-indicator--icon-only" : ""}`}
      aria-label={label}
    >
      {content}
    </span>
  );
}
