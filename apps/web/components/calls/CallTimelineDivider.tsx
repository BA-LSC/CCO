"use client";

import { useEffect, useState } from "react";
import { PanelHeaderPhoneIcon } from "@/components/PanelHeaderIcons";
import { CallTimelineJoinAction } from "@/components/calls/CallTimelineJoinAction";
import { useActiveCallsMap } from "@/hooks/useActiveCallsMap";
import {
  formatCallLiveDuration,
  formatCallTimelineLabel,
  type CallTimelineEventDto,
} from "@/lib/call-timeline";

type Props = {
  event: CallTimelineEventDto;
  conversationId: string;
};

function liveElapsedSeconds(startedAt: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
}

export function CallTimelineDivider({ event, conversationId }: Props) {
  const { getActiveCall } = useActiveCallsMap();
  const activeCall = getActiveCall(conversationId);
  const isLive = event.kind === "started";

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isLive, event.at]);

  const label = isLive
    ? formatCallLiveDuration(liveElapsedSeconds(event.at, nowMs))
    : formatCallTimelineLabel(event);

  const statusClass =
    event.kind === "missed"
      ? "messages-call-divider--missed"
      : isLive
        ? activeCall?.id === event.callId
          ? "messages-call-divider--live"
          : "messages-call-divider--active"
        : event.kind === "ended"
          ? "messages-call-divider--ended"
          : "";

  return (
    <div className={`messages-call-divider ${statusClass}`.trim()} role="status">
      <span className="messages-call-divider-label">
        <PanelHeaderPhoneIcon className="messages-call-divider-icon" />
        <time dateTime={event.at}>{label}</time>
      </span>
      <CallTimelineJoinAction event={event} conversationId={conversationId} />
    </div>
  );
}
