"use client";

import { useState } from "react";
import type { CallSummaryDto } from "@cco/shared/calls";
import { CallInviteDialog } from "./CallInviteDialog";

type Props = {
  activeCall: CallSummaryDto | null;
  loading: boolean;
  onStart: () => void;
  onJoin: () => void;
  callId?: string | null;
};

export function CallActionButton({ activeCall, loading, onStart, onJoin, callId }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);

  if (activeCall && !callId) {
    return (
      <>
        <button
          type="button"
          className="btn btn-secondary btn-sm call-action-btn"
          disabled={loading}
          onClick={onJoin}
        >
          Join call
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm call-action-btn"
          disabled={loading}
          onClick={() => setInviteOpen(true)}
          aria-label="Invite to call"
        >
          Invite
        </button>
        {inviteOpen ? (
          <CallInviteDialog callId={activeCall.id} onClose={() => setInviteOpen(false)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm call-action-btn"
        disabled={loading}
        onClick={onStart}
        aria-label="Start call"
      >
        Call
      </button>
      {inviteOpen && callId ? (
        <CallInviteDialog callId={callId} onClose={() => setInviteOpen(false)} />
      ) : null}
    </>
  );
}

export function ActiveCallBanner({
  activeCall,
  onJoin,
}: {
  activeCall: CallSummaryDto;
  onJoin: () => void;
}) {
  return (
    <div className="active-call-banner" role="status">
      <span>
        Call in progress · {activeCall.participantCount} participant
        {activeCall.participantCount === 1 ? "" : "s"}
      </span>
      <button type="button" className="btn btn-primary btn-sm" onClick={onJoin}>
        Join
      </button>
    </div>
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
    <div className="incoming-call-toast" role="alert">
      <p>{hostName} started a call</p>
      <div className="incoming-call-toast-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onJoin}>
          Join
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
