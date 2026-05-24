"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  RealtimeKitProvider,
  useRealtimeKitClient,
  useRealtimeKitMeeting,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import { RtkMeeting } from "@cloudflare/realtimekit-react-ui";
import { shouldApplySoloCallBehavior } from "@/lib/call-solo";

const SOLO_CALL_AUTO_LEAVE_MS = 5 * 60 * 1000;

type Props = {
  authToken: string;
  sessionParticipantCount: number;
  onLeave: () => void;
  /** When false, join immediately using the participant name from the auth token. */
  showSetupScreen?: boolean;
};

function useSoloCallBehavior(
  meeting: ReturnType<typeof useRealtimeKitMeeting>["meeting"],
  overlayRef: RefObject<HTMLDivElement | null>,
  sessionParticipantCount: number,
) {
  const roomJoined = useRealtimeKitSelector((m) => m.self.roomJoined);
  const participantCount = useRealtimeKitSelector((m) => m.participants.count);
  const [othersJoinedInRoom, setOthersJoinedInRoom] = useState(false);
  const sessionParticipantCountRef = useRef(sessionParticipantCount);

  sessionParticipantCountRef.current = sessionParticipantCount;

  useEffect(() => {
    if (!meeting) return;
    if (meeting.participants.count > 0) {
      setOthersJoinedInRoom(true);
    }

    const onParticipantJoined = () => {
      setOthersJoinedInRoom(true);
    };

    meeting.participants.joined.on("participantJoined", onParticipantJoined);
    return () => {
      meeting.participants.joined.off("participantJoined", onParticipantJoined);
    };
  }, [meeting]);

  const isSoloNow = () =>
    shouldApplySoloCallBehavior(
      sessionParticipantCountRef.current,
      meeting?.participants.count ?? 0,
      othersJoinedInRoom,
    );

  useEffect(() => {
    if (!meeting) return;
    const root = overlayRef.current;
    if (!root) return;

    const leaveImmediately = () => {
      void meeting.leaveRoom();
    };

    const onLeaveClick = (event: MouseEvent) => {
      if (!isSoloNow()) return;
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
      if (detail?.activeLeaveConfirmation !== true || !isSoloNow()) return;
      event.stopImmediatePropagation();
      leaveImmediately();
    };

    root.addEventListener("click", onLeaveClick, true);
    root.addEventListener("rtkStateUpdate", onLeaveConfirmation, true);
    return () => {
      root.removeEventListener("click", onLeaveClick, true);
      root.removeEventListener("rtkStateUpdate", onLeaveConfirmation, true);
    };
  }, [meeting, overlayRef, othersJoinedInRoom, sessionParticipantCount]);

  useEffect(() => {
    if (!meeting || !roomJoined || !isSoloNow()) return;
    const timer = setTimeout(() => {
      if (!isSoloNow()) return;
      void meeting.leaveRoom();
    }, SOLO_CALL_AUTO_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [meeting, roomJoined, participantCount, othersJoinedInRoom, sessionParticipantCount]);
}

function MeetingInner({
  authToken,
  sessionParticipantCount,
  onLeave,
  showSetupScreen = false,
}: {
  authToken: string;
  sessionParticipantCount: number;
  onLeave: () => void;
  showSetupScreen?: boolean;
}) {
  const { meeting } = useRealtimeKitMeeting();
  const rtkRef = useRef<HTMLRtkMeetingElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onLeaveRef = useRef(onLeave);
  const leftRef = useRef(false);

  onLeaveRef.current = onLeave;

  useSoloCallBehavior(meeting, overlayRef, sessionParticipantCount);

  useLayoutEffect(() => {
    if (showSetupScreen || !rtkRef.current) return;
    rtkRef.current.showSetupScreen = false;
  }, [showSetupScreen, meeting, authToken]);

  useEffect(() => {
    if (!meeting) return;
    leftRef.current = false;
    const handler = () => {
      if (leftRef.current) return;
      leftRef.current = true;
      onLeaveRef.current();
    };
    meeting.self.on("roomLeft", handler);
    return () => {
      meeting.self.off("roomLeft", handler);
      if (!leftRef.current && meeting.self.roomJoined) {
        leftRef.current = true;
        void meeting.leaveRoom();
        onLeaveRef.current();
      }
    };
  }, [meeting]);

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

export function CallOverlay({
  authToken,
  sessionParticipantCount,
  onLeave,
  showSetupScreen = false,
}: Props) {
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
          sessionParticipantCount={sessionParticipantCount}
          onLeave={onLeave}
          showSetupScreen={showSetupScreen}
        />
      </RealtimeKitProvider>
    </div>
  );
}
