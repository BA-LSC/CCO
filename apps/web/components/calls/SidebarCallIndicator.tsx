"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PanelHeaderPhoneIcon } from "@/components/PanelHeaderIcons";
import { useOptionalActiveCall } from "@/components/calls/ConversationCallContext";

type Props = {
  conversationId: string;
  participantCount: number;
};

export function SidebarCallIndicator({ conversationId, participantCount }: Props) {
  const router = useRouter();
  const callCtx = useOptionalActiveCall();
  const inCall = callCtx?.inCall ?? false;
  const inCallHere = callCtx?.inCallOnConversation(conversationId) ?? false;
  const homeChatPath = callCtx?.homeChatPath;

  const label = `Active call, ${participantCount} participant${
    participantCount === 1 ? "" : "s"
  }`;

  const content = (
    <>
      <PanelHeaderPhoneIcon className="sidebar-call-indicator-icon" />
      <span className="sidebar-call-indicator-count">{participantCount}</span>
    </>
  );

  if (inCall && inCallHere && homeChatPath) {
    return (
      <Link
        href={homeChatPath}
        className="sidebar-call-indicator sidebar-call-indicator--action"
        aria-label={`Return to call, ${label}`}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </Link>
    );
  }

  if (!inCall) {
    return (
      <button
        type="button"
        className="sidebar-call-indicator sidebar-call-indicator--action"
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
        className="sidebar-call-indicator sidebar-call-indicator--action"
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
    <span className="sidebar-call-indicator" aria-label={label}>
      {content}
    </span>
  );
}
