"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { RtkMeeting } from "@cloudflare/realtimekit-react-ui";

const SOLO_CALL_AUTO_LEAVE_MS = 5 * 60 * 1000;

type Props = {
  authToken: string;
  onLeave: () => void;
  /** When false, join immediately using the participant name from the auth token. */
  showSetupScreen?: boolean;
};

function isSoloCall(meeting: NonNullable<ReturnType<typeof useRealtimeKitMeeting>["meeting"]>) {
  return meeting.participants.count <= 1;
}

function useSoloCallBehavior(
  meeting: ReturnType<typeof useRealtimeKitMeeting>["meeting"],
  overlayRef: RefObject<HTMLDivElement | null>,
) {
  const roomJoined = useRealtimeKitSelector((m) => m.self.roomJoined);
  const participantCount = useRealtimeKitSelector((m) => m.participants.count);

  useEffect(() => {
    if (!meeting) return;
    const root = overlayRef.current;
    if (!root) return;

    const leaveImmediately = () => {
      void meeting.leaveRoom();
    };

    const onLeaveClick = (event: MouseEvent) => {
      if (!isSoloCall(meeting)) return;
      const hitLeaveButton = event.composedPath().some(
        (el) => el instanceof HTMLElement && el.tagName === "RTK-LEAVE-BUTTON",
      );
      if (!hitLeaveButton) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      leaveImmediately();
    };

    const onLeaveConfirmation = (event: Event) => {
      const detail = (event as CustomEvent<{ activeLeaveConfirmation?: boolean }>).detail;
      if (detail?.activeLeaveConfirmation !== true || !isSoloCall(meeting)) return;
      event.stopImmediatePropagation();
      leaveImmediately();
    };

    root.addEventListener("click", onLeaveClick, true);
    root.addEventListener("rtkStateUpdate", onLeaveConfirmation, true);
    return () => {
      root.removeEventListener("click", onLeaveClick, true);
      root.removeEventListener("rtkStateUpdate", onLeaveConfirmation, true);
    };
  }, [meeting, overlayRef]);

  useEffect(() => {
    if (!meeting || !roomJoined || participantCount > 1) return;
    const timer = setTimeout(() => {
      void meeting.leaveRoom();
    }, SOLO_CALL_AUTO_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [meeting, roomJoined, participantCount]);
}

function MeetingInner({
  authToken,
  onLeave,
  showSetupScreen = false,
}: {
  authToken: string;
  onLeave: () => void;
  showSetupScreen?: boolean;
}) {
  const { meeting } = useRealtimeKitMeeting();
  const rtkRef = useRef<HTMLRtkMeetingElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useSoloCallBehavior(meeting, overlayRef);

  useLayoutEffect(() => {
    if (showSetupScreen || !rtkRef.current) return;
    rtkRef.current.showSetupScreen = false;
  }, [showSetupScreen, meeting, authToken]);

  useEffect(() => {
    if (!meeting) return;
    const handler = () => onLeave();
    meeting.self.on("roomLeft", handler);
    return () => {
      meeting.self.off("roomLeft", handler);
    };
  }, [meeting, onLeave]);

  useEffect(() => {
    if (!meeting || showSetupScreen || meeting.self.roomJoined) return;
    void meeting.joinRoom().catch(() => {
      // RtkMeeting may already be joining; ignore duplicate attempts.
    });
  }, [meeting, showSetupScreen, authToken]);

  if (!meeting) return null;

  return (
    <div className="call-overlay-meeting" ref={overlayRef}>
      <RtkMeeting
        key={authToken}
        ref={rtkRef}
        mode="fill"
        meeting={meeting}
        showSetupScreen={showSetupScreen}
        loadConfigFromPreset={false}
      />
    </div>
  );
}

export function CallOverlay({ authToken, onLeave, showSetupScreen = false }: Props) {
  const [meeting, initMeeting] = useRealtimeKitClient();

  useEffect(() => {
    void initMeeting({
      authToken,
      defaults: { video: false },
    });
  }, [authToken, initMeeting]);

  return (
    <div className="call-overlay" role="dialog" aria-label="Video call">
      <RealtimeKitProvider value={meeting}>
        <MeetingInner
          authToken={authToken}
          onLeave={onLeave}
          showSetupScreen={showSetupScreen}
        />
      </RealtimeKitProvider>
    </div>
  );
}
