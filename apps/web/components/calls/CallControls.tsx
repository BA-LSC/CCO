"use client";

import type { CallSummaryDto } from "@cco/shared/calls";
import { ChatHomeBanner } from "@/components/ChatHomeBanner";
import { PanelHeaderPhoneIcon } from "@/components/PanelHeaderIcons";

type CallIconState = "idle" | "waiting" | "joinable" | "in-call";

type Props = {
  activeCall: CallSummaryDto | null;
  inCall: boolean;
  loading: boolean;
  disabled?: boolean;
  onStart: () => void;
  onJoin: () => void;
  onLeave: () => void;
};

function getCallIconState(activeCall: CallSummaryDto | null, inCall: boolean): CallIconState {
  if (inCall) return "in-call";
  if (!activeCall) return "idle";
  if (activeCall.participantCount === 0) return "waiting";
  return "joinable";
}

function getCallLabel(state: CallIconState, activeCall: CallSummaryDto | null): string {
  switch (state) {
    case "in-call":
      return "Leave call";
    case "waiting":
      return "Call in progress — join";
    case "joinable":
      return `Join call (${activeCall!.participantCount} participant${
        activeCall!.participantCount === 1 ? "" : "s"
      })`;
    case "idle":
      return "Start call";
  }
}

export function CallActionButton({
  activeCall,
  inCall,
  loading,
  disabled = false,
  onStart,
  onJoin,
  onLeave,
}: Props) {
  const state = getCallIconState(activeCall, inCall);
  const label =
    loading && inCall
      ? "Leaving call…"
      : loading && !inCall
        ? "Starting call…"
        : getCallLabel(state, activeCall);
  const isDisabled = disabled || loading;
  const visualState = loading && !inCall ? "loading" : state;

  const handleClick = () => {
    if (inCall) {
      onLeave();
      return;
    }
    if (activeCall) {
      onJoin();
      return;
    }
    onStart();
  };

  return (
    <button
      type="button"
      className={`panel-header-icon-btn call-header-btn call-header-btn--${visualState}`}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      onClick={handleClick}
      aria-label={label}
      title={label}
      aria-pressed={!inCall && (state === "waiting" || state === "joinable")}
    >
      <PanelHeaderPhoneIcon />
    </button>
  );
}

/** Visible gray phone icon for header loading placeholders. */
export function CallActionButtonPlaceholder() {
  return (
    <CallActionButton
      activeCall={null}
      inCall={false}
      loading={false}
      disabled
      onStart={() => {}}
      onJoin={() => {}}
      onLeave={() => {}}
    />
  );
}

export function IncomingCallToast({
  hostName,
  onJoin,
  onDismiss,
}: {
  hostName: string;
  onJoin: () => void;
  onDismiss: () => void;
}) {
  return (
    <ChatHomeBanner
      variant="neutral"
      placement="fixed"
      actions={
        <>
          <button
            type="button"
            className="chat-home-banner-btn chat-home-banner-btn--answer"
            onClick={onJoin}
          >
            Answer
          </button>
          <button
            type="button"
            className="chat-home-banner-btn chat-home-banner-btn--decline"
            onClick={onDismiss}
          >
            Decline
          </button>
        </>
      }
    >
      {hostName} started a call
    </ChatHomeBanner>
  );
}
