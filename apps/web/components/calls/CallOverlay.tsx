"use client";

import { useEffect } from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
} from "@cloudflare/realtimekit-react";
import { RtkMeeting } from "@cloudflare/realtimekit-react-ui";

type Props = {
  authToken: string;
  onLeave: () => void;
};

function MeetingInner({ onLeave }: { onLeave: () => void }) {
  const { meeting } = useRealtimeKitMeeting();

  useEffect(() => {
    if (!meeting) return;
    const handler = () => onLeave();
    meeting.self.on("roomLeft", handler);
    return () => {
      meeting.self.off("roomLeft", handler);
    };
  }, [meeting, onLeave]);

  if (!meeting) return null;

  return (
    <div className="call-overlay-meeting">
      <RtkMeeting mode="fill" meeting={meeting} showSetupScreen={true} />
    </div>
  );
}

export function CallOverlay({ authToken, onLeave }: Props) {
  const [meeting, initMeeting] = useRealtimeKitClient();

  useEffect(() => {
    void initMeeting({ authToken });
  }, [authToken, initMeeting]);

  return (
    <div className="call-overlay" role="dialog" aria-label="Video call">
      <div className="call-overlay-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onLeave}>
          Leave call
        </button>
      </div>
      <RealtimeKitProvider value={meeting}>
        <MeetingInner onLeave={onLeave} />
      </RealtimeKitProvider>
    </div>
  );
}
