"use client";

import { useState, type CSSProperties } from "react";
import { useActiveCall } from "@/components/calls/ConversationCallContext";
import { CallInviteDialog } from "@/components/calls/CallInviteDialog";
import type { PipPosition } from "@/hooks/usePipPanel";

const INLINE_ACTIONS_HEIGHT = 36;
const PIP_HANDLE_HEIGHT = 48;

type Props = {
  placement?: "inline" | "pip";
  inlineAnchorRect?: DOMRect | null;
  pipAnchorRect?: PipPosition | null;
  pipCollapsed?: boolean;
};

export function callInCallActionsInlineOffset(): number {
  return INLINE_ACTIONS_HEIGHT;
}

export function CallInCallActions({
  placement = "pip",
  inlineAnchorRect,
  pipAnchorRect,
  pipCollapsed = false,
}: Props) {
  const { activeCall, isHost, endForAll } = useActiveCall();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!activeCall) return null;

  const handleEndForAll = () => {
    if (!window.confirm("End this call for everyone?")) return;
    void endForAll();
  };

  let style: CSSProperties | undefined;
  if (placement === "inline" && inlineAnchorRect) {
    style = {
      position: "fixed",
      top: inlineAnchorRect.top,
      left: inlineAnchorRect.left,
      width: inlineAnchorRect.width,
      height: INLINE_ACTIONS_HEIGHT,
      zIndex: 101,
    };
  } else if (placement === "pip" && pipAnchorRect && !pipCollapsed) {
    style = {
      position: "fixed",
      top: pipAnchorRect.y + PIP_HANDLE_HEIGHT,
      left: pipAnchorRect.x,
      width: Math.min(360, window.innerWidth - 40),
      zIndex: 1201,
    };
  }

  return (
    <>
      <div className="call-in-call-actions" style={style}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setInviteOpen(true)}
        >
          Invite
        </button>
        {isHost ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleEndForAll}>
            End for all
          </button>
        ) : null}
      </div>
      {inviteOpen ? (
        <CallInviteDialog callId={activeCall.id} onClose={() => setInviteOpen(false)} />
      ) : null}
    </>
  );
}
